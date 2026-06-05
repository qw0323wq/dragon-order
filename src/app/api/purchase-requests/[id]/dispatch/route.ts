/**
 * POST /api/purchase-requests/[id]/dispatch
 *
 * 拆單：把需求單按廠商分組 → 為每家供應商建一張 orders + order_items
 *
 * 邏輯：
 *   1. 拉需求單 + items（含 chosen_item_id）
 *   2. 對每行：用 chosen_item_id 找 item.supplier_id
 *   3. 按 supplier_id 分組
 *   4. 為每組建 orders（一張單對一家廠商）
 *   5. 寫 order_items（itemId, storeId 從 request.store_id, quantity, unitPrice from item.cost_price）
 *   6. 標 purchase_requests.status='processed' + 記 order_ids
 *
 * 用 transaction 保證原子性。
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { requireManagerOrAbove } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";
import { roundMoney, formatDateLocal } from "@/lib/format";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;

  const userId = auth.userId ?? null;
  const { id } = await params;
  const reqId = parseIntSafe(id);
  if (reqId === null) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  // 拉需求單
  const [req] = (await sql`
    SELECT id, store_id, status FROM purchase_requests WHERE id = ${reqId}
  `) as unknown as Array<{ id: number; store_id: number; status: string }>;
  if (!req) return NextResponse.json({ error: "找不到需求單" }, { status: 404 });
  if (req.status === "processed") {
    return NextResponse.json({ error: "已拆單過" }, { status: 400 });
  }
  if (req.status === "cancelled") {
    return NextResponse.json({ error: "需求單已取消" }, { status: 400 });
  }

  // 拉 items（必須每行都有 chosen_item_id 才能拆）
  const items = (await sql`
    SELECT pri.id, pri.ingredient_name, pri.needed_qty, pri.unit, pri.chosen_item_id,
           it.supplier_id, it.cost_price, it.unit as item_unit
    FROM purchase_request_items pri
    LEFT JOIN items it ON pri.chosen_item_id = it.id
    WHERE pri.request_id = ${reqId}
    ORDER BY pri.sort_order
  `) as unknown as Array<{
    id: number;
    ingredient_name: string;
    needed_qty: string;
    unit: string;
    chosen_item_id: number | null;
    supplier_id: number | null;
    cost_price: string;
    item_unit: string;
  }>;

  if (items.length === 0) {
    return NextResponse.json({ error: "需求單沒有明細" }, { status: 400 });
  }

  const noSupplier = items.filter((it) => !it.chosen_item_id || !it.supplier_id);
  if (noSupplier.length > 0) {
    return NextResponse.json(
      {
        error: `${noSupplier.length} 個食材還沒選供應商：${noSupplier.map((x) => x.ingredient_name).join("、")}`,
      },
      { status: 400 }
    );
  }

  // 按 supplier_id 分組
  const bySupplier = new Map<number, typeof items>();
  for (const it of items) {
    const sid = it.supplier_id!;
    (bySupplier.get(sid) ?? bySupplier.set(sid, []).get(sid)!).push(it);
  }

  // 包 transaction：建 orders + order_items + 標記 request processed
  try {
    const createdOrderIds = await sql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof sql;
      const today = formatDateLocal();
      const orderIds: number[] = [];

      for (const [supplierId, group] of bySupplier.entries()) {
        // 算這張單的總額
        let total = 0;
        for (const g of group) {
          const qty = Number(g.needed_qty);
          const unitPrice = Number(g.cost_price);
          total += qty * unitPrice;
        }
        total = roundMoney(total);

        // 建 order（status='submitted' 直接送出，因為老闆已確認過）
        const [order] = (await tx`
          INSERT INTO orders
            (order_date, status, total_amount, notes, created_by)
          VALUES
            (${today}, 'submitted', ${total}, ${'從採購需求 #' + reqId + ' 拆出'}, ${userId})
          RETURNING id
        `) as unknown as Array<{ id: number }>;

        // 寫 order_items（每筆食材 → 對應的 SKU + storeId from request.store_id）
        for (const g of group) {
          const qty = Number(g.needed_qty);
          const unitPrice = Number(g.cost_price);
          const subtotal = roundMoney(qty * unitPrice);
          await tx`
            INSERT INTO order_items
              (order_id, item_id, store_id, quantity, unit, unit_price, subtotal, created_by)
            VALUES
              (${order.id}, ${g.chosen_item_id}, ${req.store_id}, ${qty}, ${g.unit || g.item_unit},
               ${unitPrice}, ${subtotal}, ${userId})
          `;
        }

        orderIds.push(order.id);
        void supplierId; // 在 inner code 用過但 lint 友善
      }

      // 標記需求單已處理
      await tx`
        UPDATE purchase_requests SET
          status = 'processed',
          processed_by = ${userId},
          processed_at = NOW(),
          order_ids = ${orderIds},
          updated_at = NOW()
        WHERE id = ${reqId}
      `;

      return orderIds;
    });

    return NextResponse.json({
      success: true,
      orderIds: createdOrderIds,
      supplierCount: createdOrderIds.length,
    });
  } catch (err) {
    console.error("[purchase-requests dispatch] error:", err);
    const msg = err instanceof Error ? err.message : "拆單失敗，已自動回滾";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
