/**
 * 付款 API（訂單 grain）
 *
 * GET    /api/payments?month=YYYY-MM[&storeId=N]
 *   → 回 orders[]（訂單×供應商組合，含驗收/付款狀態）+ suppliers[] 聚合 + summary
 *
 * POST   /api/payments
 *   Body: { items: Array<{ orderId, supplierId, amount, status, paidAt?, paymentType?, notes? }> }
 *   → 批次 upsert（不存在就 INSERT，存在就 UPDATE）。一律走這條路。
 *
 * PATCH  /api/payments
 *   Body: { paymentId | paymentIds, status, paidAt?, notes? }
 *   → 改現有 payments 紀錄的狀態 / 匯款日期（向後相容用）
 */
import { NextRequest, NextResponse } from "next/server";
import { db, rawSql } from "@/lib/db";
import { stores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, requireAdmin } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

/** timestamp → 'YYYY-MM-DD'（本地時區，避免 toISOString UTC bug） */
function tsToDateLocal(ts: unknown): string | null {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(String(ts));
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─────────────────────────────────────────────
// GET — 取得月結報表（含訂單細項 + 供應商聚合）
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const storeId = searchParams.get("storeId");

  if (!month) {
    return NextResponse.json({ error: "缺少 month 參數（格式：YYYY-MM）" }, { status: 400 });
  }

  const parsedStoreId = parseIntSafe(storeId);
  if (storeId && parsedStoreId === null) {
    return NextResponse.json({ error: "無效的門市 ID" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;

  // CRITICAL: 一個 query 拿所有「訂單×供應商」的應付狀態
  //   - 一張訂單可能跨多個供應商（不同品項）→ 每個 supplier 一行
  //   - LEFT JOIN receiving 算應付：(received - returned) × unit_price
  //   - LEFT JOIN payments 帶出付款狀態 + 匯款日期
  const storeFilterSql = parsedStoreId !== null
    ? rawSql`AND oi.store_id = ${parsedStoreId}`
    : rawSql``;

  const orderRows = await rawSql`
    SELECT
      o.id as order_id,
      o.order_date,
      s.id as supplier_id,
      s.name as supplier_name,
      s.payment_type,
      COUNT(oi.id)::int as item_count,
      COUNT(r.id)::int as received_item_count,
      COALESCE(SUM(oi.subtotal), 0) as total_amount,
      COALESCE(SUM(CASE
        WHEN r.id IS NULL THEN 0
        WHEN r.result = '未到貨' THEN 0
        ELSE ROUND((r.received_qty - COALESCE(r.returned_qty, 0)) * oi.unit_price, 2)
      END), 0) as payable_sum,
      p.id as payment_id,
      p.status as payment_status,
      p.amount as paid_amount,
      p.paid_at,
      p.notes as payment_notes
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    JOIN items i ON oi.item_id = i.id
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN receiving r ON r.order_item_id = oi.id
    LEFT JOIN payments p ON p.order_id = o.id AND p.supplier_id = s.id
    WHERE o.order_date >= ${startDate}
      AND o.order_date <= ${endDate}
      ${storeFilterSql}
    GROUP BY o.id, o.order_date, s.id, s.name, s.payment_type, p.id, p.status, p.amount, p.paid_at, p.notes
    ORDER BY o.order_date DESC, s.name
  ` as unknown as Array<Record<string, unknown>>;

  // 訂單細項（每張 = 一個結帳單位）
  const orders = orderRows.map((r) => {
    const itemCount = Number(r.item_count);
    const receivedItemCount = Number(r.received_item_count);
    const fullyReceived = itemCount > 0 && receivedItemCount === itemCount;
    const totalAmount = Number(r.total_amount);
    const payableSum = Number(r.payable_sum);
    return {
      orderId: Number(r.order_id),
      orderDate: String(r.order_date),
      supplierId: Number(r.supplier_id),
      supplierName: String(r.supplier_name),
      paymentType: String(r.payment_type),
      itemCount,
      receivedItemCount,
      fullyReceived,
      totalAmount,
      // 全部驗收完才有 payableAmount，否則 null（前端顯示「未驗收」）
      payableAmount: fullyReceived ? payableSum : null,
      paymentId: r.payment_id ? Number(r.payment_id) : null,
      paymentStatus: (r.payment_status ?? "unpaid") as string,
      paidAmount: r.paid_amount != null ? Number(r.paid_amount) : 0,
      paidAt: tsToDateLocal(r.paid_at),
      paymentNotes: (r.payment_notes ?? null) as string | null,
    };
  });

  // 聚合到供應商層（總覽 + 列印對帳單用）
  type SupplierAggr = {
    supplierId: number;
    supplierName: string;
    paymentType: string;
    orderCount: number;
    itemCount: number;
    receivedItemCount: number;
    totalAmount: number;
    payableSum: number;
    paidAmount: number;
    pendingAmount: number;
    payments: Array<{ id: number; status: string; amount: number; paidAt: string | null }>;
  };
  const supplierMap = new Map<number, SupplierAggr>();
  for (const op of orders) {
    if (!supplierMap.has(op.supplierId)) {
      supplierMap.set(op.supplierId, {
        supplierId: op.supplierId,
        supplierName: op.supplierName,
        paymentType: op.paymentType,
        orderCount: 0,
        itemCount: 0,
        receivedItemCount: 0,
        totalAmount: 0,
        payableSum: 0,
        paidAmount: 0,
        pendingAmount: 0,
        payments: [],
      });
    }
    const s = supplierMap.get(op.supplierId)!;
    s.orderCount += 1;
    s.itemCount += op.itemCount;
    s.receivedItemCount += op.receivedItemCount;
    s.totalAmount += op.totalAmount;
    s.payableSum += op.payableAmount ?? 0;
    if (op.paymentStatus === "paid") s.paidAmount += op.paidAmount;
    if (op.paymentStatus === "pending") s.pendingAmount += op.paidAmount;
    if (op.paymentId) {
      s.payments.push({
        id: op.paymentId,
        status: op.paymentStatus,
        amount: op.paidAmount,
        paidAt: op.paidAt,
      });
    }
  }

  const suppliers = Array.from(supplierMap.values()).map((s) => {
    const fullyReceived = s.itemCount > 0 && s.receivedItemCount === s.itemCount;
    const payableAmount = fullyReceived ? s.payableSum : null;
    const baseAmount = payableAmount ?? s.totalAmount;
    const unpaidAmount = Math.max(0, baseAmount - s.paidAmount - s.pendingAmount);
    return {
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      paymentType: s.paymentType,
      orderCount: s.orderCount,
      itemCount: s.itemCount,
      receivedItemCount: s.receivedItemCount,
      fullyReceived,
      totalAmount: s.totalAmount,
      payableAmount,
      paidAmount: s.paidAmount,
      pendingAmount: s.pendingAmount,
      unpaidAmount,
      payments: s.payments,
    };
  });

  const summary = {
    totalAmount: suppliers.reduce((sum, s) => sum + s.totalAmount, 0),
    payableAmount: suppliers.reduce(
      (sum, s) => sum + (s.payableAmount ?? s.totalAmount),
      0
    ),
    paidAmount: suppliers.reduce((sum, s) => sum + s.paidAmount, 0),
    unpaidAmount: suppliers.reduce((sum, s) => sum + s.unpaidAmount, 0),
  };

  // 門市資訊（門市模式列印用）
  let storeInfo = null;
  if (parsedStoreId !== null) {
    const [store] = await db
      .select({
        id: stores.id,
        name: stores.name,
        companyName: stores.companyName,
        taxId: stores.taxId,
      })
      .from(stores)
      .where(eq(stores.id, parsedStoreId))
      .limit(1);
    storeInfo = store || null;
  }

  return NextResponse.json({
    month,
    storeId: parsedStoreId,
    storeInfo,
    orders,
    suppliers,
    summary,
  });
}

// ─────────────────────────────────────────────
// POST — 批次 upsert payments（標記已付/取消已付主流程）
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const items = body.items as Array<{
    orderId: number;
    supplierId: number;
    amount: number;
    status: "paid" | "pending" | "unpaid";
    /** 'YYYY-MM-DD'，status='paid' 時的匯款日期。沒填用 NOW() */
    paidAt?: string;
    /** INSERT 用；UPDATE 不會動 */
    paymentType?: string;
    notes?: string | null;
  }>;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "缺少 items 陣列" }, { status: 400 });
  }
  if (items.length > 200) {
    return NextResponse.json({ error: "批次一次最多 200 筆" }, { status: 400 });
  }

  // CRITICAL: 整批 upsert 包 transaction，部分失敗整批 rollback
  // 用 (order_id, supplier_id) 當 unique key 做 upsert（先 UPDATE，沒 row 再 INSERT）
  try {
    const result = await rawSql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof rawSql;
      const upserted: Record<string, unknown>[] = [];

      for (const item of items) {
        // paid_at 處理：給 'YYYY-MM-DD 12:00:00' 避免時區跨日
        // status !== 'paid' → paid_at = NULL
        // status === 'paid' + paidAt 有填 → 用使用者指定日
        // status === 'paid' + paidAt 未填 → NOW()
        const paidAtTs =
          item.status === "paid" && item.paidAt
            ? `${item.paidAt} 12:00:00`
            : null;
        const useNow = item.status === "paid" && !item.paidAt;
        const useNullTs = item.status !== "paid";

        // INSERT 用 — UPDATE 不需要動 payment_type
        let paymentType = item.paymentType;
        if (!paymentType) {
          const [sup] = await tx`SELECT payment_type FROM suppliers WHERE id = ${item.supplierId}`;
          paymentType = (sup?.payment_type ?? "月結") as string;
        }

        // 先 UPDATE（用 RETURNING 看有沒有命中）
        const updateResult: Record<string, unknown>[] = useNullTs
          ? await tx`
              UPDATE payments SET
                amount = ${item.amount},
                status = ${item.status},
                paid_at = NULL,
                notes = ${item.notes ?? null}
              WHERE order_id = ${item.orderId} AND supplier_id = ${item.supplierId}
              RETURNING *
            `
          : useNow
          ? await tx`
              UPDATE payments SET
                amount = ${item.amount},
                status = ${item.status},
                paid_at = NOW(),
                notes = ${item.notes ?? null}
              WHERE order_id = ${item.orderId} AND supplier_id = ${item.supplierId}
              RETURNING *
            `
          : await tx`
              UPDATE payments SET
                amount = ${item.amount},
                status = ${item.status},
                paid_at = ${paidAtTs}::timestamp,
                notes = ${item.notes ?? null}
              WHERE order_id = ${item.orderId} AND supplier_id = ${item.supplierId}
              RETURNING *
            `;

        if (updateResult.length > 0) {
          upserted.push(updateResult[0]);
          continue;
        }

        // INSERT
        const insertResult: Record<string, unknown>[] = useNullTs
          ? await tx`
              INSERT INTO payments (order_id, supplier_id, amount, status, payment_type, paid_at, notes)
              VALUES (${item.orderId}, ${item.supplierId}, ${item.amount}, ${item.status},
                      ${paymentType}, NULL, ${item.notes ?? null})
              RETURNING *
            `
          : useNow
          ? await tx`
              INSERT INTO payments (order_id, supplier_id, amount, status, payment_type, paid_at, notes)
              VALUES (${item.orderId}, ${item.supplierId}, ${item.amount}, ${item.status},
                      ${paymentType}, NOW(), ${item.notes ?? null})
              RETURNING *
            `
          : await tx`
              INSERT INTO payments (order_id, supplier_id, amount, status, payment_type, paid_at, notes)
              VALUES (${item.orderId}, ${item.supplierId}, ${item.amount}, ${item.status},
                      ${paymentType}, ${paidAtTs}::timestamp, ${item.notes ?? null})
              RETURNING *
            `;
        upserted.push(insertResult[0]);
      }

      return upserted;
    });

    return NextResponse.json({ success: true, count: result.length, items: result });
  } catch (err) {
    console.error("[payments POST] error:", err);
    const msg = err instanceof Error ? err.message : "付款建立/更新失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────
// PATCH — 改現有 payments 紀錄的狀態 / 匯款日期（by paymentId）
// 向後相容用；新流程建議走 POST upsert
// ─────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { paymentId, paymentIds, status, paidAt, notes } = body as {
    paymentId?: number;
    paymentIds?: number[];
    status: string;
    /** 'YYYY-MM-DD'，status='paid' 時可指定匯款日期 */
    paidAt?: string;
    notes?: string | null;
  };

  const ids: number[] = Array.isArray(paymentIds)
    ? paymentIds
    : typeof paymentId === "number"
    ? [paymentId]
    : [];

  if (ids.length === 0 || !status) {
    return NextResponse.json(
      { error: "缺少 paymentId/paymentIds 或 status" },
      { status: 400 }
    );
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: "批次付款一次最多 200 筆" }, { status: 400 });
  }
  const validStatuses = ["unpaid", "pending", "paid"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "無效的付款狀態" }, { status: 400 });
  }

  // CRITICAL: paid_at 用 NOW() 或指定 'YYYY-MM-DD' 字串，不用 JS Date object
  // （lib/db types.numeric parser 副作用會 reject Date instance）
  try {
    const result = await rawSql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof rawSql;

      const existingRows = await tx`
        SELECT id, status, paid_at, notes FROM payments
        WHERE id = ANY(${ids})
        FOR UPDATE
      ` as unknown as Array<{ id: number; status: string; paid_at: unknown; notes: string | null }>;
      const existingById = new Map<number, { id: number; status: string; paid_at: unknown; notes: string | null }>(
        existingRows.map((r) => [Number(r.id), r])
      );

      const notFound = ids.filter((id) => !existingById.has(id));
      const updated: Record<string, unknown>[] = [];
      const skipped: Record<string, unknown>[] = [];

      for (const id of ids) {
        const row = existingById.get(id);
        if (!row) continue;

        // 冪等：已是目標狀態 + 沒指定 paidAt（不用更新）
        if (row.status === status && !paidAt) {
          skipped.push(row);
          continue;
        }

        const paidAtTs =
          status === "paid" && paidAt ? `${paidAt} 12:00:00` : null;
        const useNow = status === "paid" && !paidAt;
        const useNullTs = status !== "paid";
        const finalNotes = notes ?? row.notes ?? null;

        const [u] = useNullTs
          ? await tx`
              UPDATE payments SET status = ${status}, paid_at = NULL, notes = ${finalNotes}
              WHERE id = ${id} RETURNING *
            `
          : useNow
          ? await tx`
              UPDATE payments SET status = ${status}, paid_at = NOW(), notes = ${finalNotes}
              WHERE id = ${id} RETURNING *
            `
          : await tx`
              UPDATE payments SET status = ${status}, paid_at = ${paidAtTs}::timestamp, notes = ${finalNotes}
              WHERE id = ${id} RETURNING *
            `;
        updated.push(u as Record<string, unknown>);
      }

      return { updated, skipped, notFound };
    });

    if (typeof paymentId === "number" && !Array.isArray(paymentIds)) {
      if (result.notFound.length > 0) {
        return NextResponse.json({ error: "找不到付款紀錄" }, { status: 404 });
      }
      return NextResponse.json(result.updated[0] ?? result.skipped[0]);
    }

    return NextResponse.json({
      success: true,
      updated: result.updated.length,
      skipped: result.skipped.length,
      notFound: result.notFound,
      total: ids.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "付款更新失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
