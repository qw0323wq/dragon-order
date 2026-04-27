/**
 * 付款 API
 * GET /api/payments?month=2026-03 — 取得月結報表資料
 * POST /api/payments — 建立付款紀錄
 * PATCH /api/payments — 更新付款狀態（標記已付款）
 */
import { NextRequest, NextResponse } from "next/server";
import { db, rawSql } from "@/lib/db";
import { payments, orders, orderItems, suppliers, items, stores, receiving } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { authenticateRequest, requireAdmin } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // 格式：2026-03
  const storeId = searchParams.get("storeId"); // 篩選特定門市（可選）

  if (!month) {
    return NextResponse.json({ error: "缺少 month 參數（格式：YYYY-MM）" }, { status: 400 });
  }

  // 計算月份的起訖日期
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;

  // 取得該月所有訂單
  const monthOrders = await db
    .select()
    .from(orders)
    .where(and(gte(orders.orderDate, startDate), lte(orders.orderDate, endDate)));

  if (monthOrders.length === 0) {
    return NextResponse.json({ month, suppliers: [], summary: { totalAmount: 0, paidAmount: 0, unpaidAmount: 0 } });
  }

  const orderIds = monthOrders.map((o) => o.id);

  // 按供應商統計訂單金額（從 order_items 計算）
  // 可選按門市篩選
  const parsedStoreId = parseIntSafe(storeId);
  if (storeId && parsedStoreId === null) {
    return NextResponse.json({ error: "無效的門市 ID" }, { status: 400 });
  }
  const storeFilter = parsedStoreId !== null ? sql` AND ${orderItems.storeId} = ${parsedStoreId}` : sql``;

  // CRITICAL: LEFT JOIN receiving 計算「應付金額」（按實收 - 退貨）
  //   - totalAmount: 採購金額（按訂購量 × 單價）
  //   - payableAmount: 應付金額
  //       全部驗收完 → SUM((received_qty - returned_qty) × unit_price)，未到貨算 0
  //       有未驗收 → null（前端顯示「-」，避免誤導）
  //   - receivedItemCount / itemCount：用於判斷「是否完全驗收」
  const supplierAmounts = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      paymentType: suppliers.paymentType,
      orderCount: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`,
      totalAmount: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
      itemCount: sql<number>`COUNT(${orderItems.id})`,
      receivedItemCount: sql<number>`COUNT(${receiving.id})`,
      payableAmount: sql<number>`COALESCE(SUM(
        CASE
          WHEN ${receiving.id} IS NULL THEN NULL
          WHEN ${receiving.result} = '未到貨' THEN 0
          ELSE ROUND((${receiving.receivedQty} - COALESCE(${receiving.returnedQty}, 0)) * ${orderItems.unitPrice}, 2)
        END
      ), 0)`,
    })
    .from(orderItems)
    .innerJoin(items, eq(orderItems.itemId, items.id))
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .leftJoin(receiving, eq(receiving.orderItemId, orderItems.id))
    .where(
      sql`${orderItems.orderId} = ANY(ARRAY[${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)}]::int[])${storeFilter}`
    )
    .groupBy(suppliers.id, suppliers.name, suppliers.paymentType);

  // 取得已有的付款紀錄
  const existingPayments = await db
    .select()
    .from(payments)
    .where(
      sql`${payments.orderId} = ANY(ARRAY[${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
    );

  // 整合付款狀態
  const supplierReport = supplierAmounts.map((s) => {
    const supplierPayments = existingPayments.filter((p) => p.supplierId === s.supplierId);
    const paidAmount = supplierPayments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = supplierPayments
      .filter((p) => p.status === "pending")
      .reduce((sum, p) => sum + p.amount, 0);

    const totalAmount = Number(s.totalAmount);
    const itemCount = Number(s.itemCount);
    const receivedItemCount = Number(s.receivedItemCount);
    // 全部品項都驗收完 → fullyReceived；payableAmount 才有意義
    const fullyReceived = itemCount > 0 && receivedItemCount === itemCount;
    // 未驗收完 → payableAmount = null；驗收完 → 取 SQL 算的值
    const payableAmount = fullyReceived ? Number(s.payableAmount) : null;

    // 未付 = 應付 - 已付 - 處理中（驗收完才有意義；未驗收前 fallback 用採購金額）
    const baseAmount = payableAmount ?? totalAmount;
    const unpaidAmount = baseAmount - paidAmount - pendingAmount;

    return {
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      paymentType: s.paymentType,
      orderCount: Number(s.orderCount),
      itemCount,
      receivedItemCount,
      fullyReceived,
      totalAmount,
      payableAmount,
      paidAmount,
      pendingAmount,
      unpaidAmount: Math.max(0, unpaidAmount),
      // 付款紀錄
      payments: supplierPayments,
    };
  });

  // 整體摘要
  // unpaid 用 baseAmount（payableAmount 或 totalAmount fallback）
  const summary = {
    totalAmount: supplierReport.reduce((sum, s) => sum + s.totalAmount, 0),
    payableAmount: supplierReport.reduce(
      (sum, s) => sum + (s.payableAmount ?? s.totalAmount),
      0
    ),
    paidAmount: supplierReport.reduce((sum, s) => sum + s.paidAmount, 0),
    unpaidAmount: supplierReport.reduce((sum, s) => sum + s.unpaidAmount, 0),
  };

  // 如果有指定門市，取得門市資訊
  let storeInfo = null;
  if (parsedStoreId !== null) {
    const [store] = await db
      .select({ id: stores.id, name: stores.name, companyName: stores.companyName, taxId: stores.taxId })
      .from(stores)
      .where(eq(stores.id, parsedStoreId))
      .limit(1);
    storeInfo = store || null;
  }

  return NextResponse.json({ month, storeId: parsedStoreId, storeInfo, suppliers: supplierReport, summary });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { orderId, supplierId, amount, paymentType, notes } = body;

  if (!orderId || !supplierId || amount === undefined) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }

  // 查是否已有紀錄
  const [existing] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.supplierId, supplierId)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "此訂單已有付款紀錄，請用 PATCH 更新" }, { status: 409 });
  }

  const [newPayment] = await db
    .insert(payments)
    .values({
      orderId,
      supplierId,
      amount,
      status: "unpaid",
      paymentType: paymentType || "月結",
      notes: notes || null,
    })
    .returning();

  return NextResponse.json(newPayment, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { paymentId, paymentIds, status, notes } = body as {
    paymentId?: number;
    paymentIds?: number[];
    status: string;
    notes?: string | null;
  };

  // 支援單筆 (paymentId) 和批次 (paymentIds) 兩種格式
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

  // 批次上限保護
  if (ids.length > 200) {
    return NextResponse.json(
      { error: "批次付款一次最多 200 筆" },
      { status: 400 }
    );
  }

  const validStatuses = ["unpaid", "pending", "paid"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "無效的付款狀態" }, { status: 400 });
  }

  // CRITICAL: 所有付款狀態變更包 transaction + SELECT FOR UPDATE 鎖行
  // 冪等：已是目標狀態的不會重寫 paid_at
  try {
    const result = await rawSql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof rawSql;

      // 一次鎖住全部要動的行（IN clause + FOR UPDATE）
      const existingRows = await tx`
        SELECT id, status, paid_at, notes FROM payments
        WHERE id = ANY(${ids})
        FOR UPDATE
      `;
      const existingById = new Map<number, any>(
        existingRows.map((r: any) => [Number(r.id), r])
      );

      const notFound = ids.filter((id) => !existingById.has(id));
      const updated: any[] = [];
      const skipped: any[] = [];

      for (const id of ids) {
        const row = existingById.get(id);
        if (!row) continue;

        // 冪等：已是目標狀態
        if (row.status === status) {
          skipped.push(row);
          continue;
        }

        // CRITICAL: paid_at 用 NOW() 不用 JS Date object（lib/db types.numeric parser 副作用）
        const [u] = status === "paid"
          ? await tx`
              UPDATE payments SET status = ${status}, paid_at = NOW(), notes = ${notes ?? row.notes ?? null}
              WHERE id = ${id} RETURNING *
            `
          : await tx`
              UPDATE payments SET status = ${status}, paid_at = NULL, notes = ${notes ?? row.notes ?? null}
              WHERE id = ${id} RETURNING *
            `;
        updated.push(u);
      }

      return { updated, skipped, notFound };
    });

    // 單筆模式：維持原格式相容前端
    if (typeof paymentId === "number" && !Array.isArray(paymentIds)) {
      if (result.notFound.length > 0) {
        return NextResponse.json({ error: "找不到付款紀錄" }, { status: 404 });
      }
      return NextResponse.json(result.updated[0] ?? result.skipped[0]);
    }

    // 批次模式：回完整摘要
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
