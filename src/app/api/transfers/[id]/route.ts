/**
 * PUT /api/transfers/[id] — 歸還/沖銷借料
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { requireManagerOrAbove } from "@/lib/api-auth";
import { verifySession } from "@/lib/session";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // CRITICAL: 歸還/沖銷操作需要 manager 以上權限
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;

  const { id: idStr } = await params;
  const id = parseInt(idStr);
  if (isNaN(id)) {
    return NextResponse.json({ error: "無效的 ID" }, { status: 400 });
  }

  let userId: number | null = null;
  if (auth.source === "cookie") {
    const session = verifySession<{ id: number }>(
      request.cookies.get("dragon-session")?.value || ""
    );
    userId = session?.id ?? null;
  }

  const body = await request.json();
  const { action, returnItems } = body as {
    action: "return" | "settle";
    returnItems?: { transferItemId: number; returnQty: number }[];
  };

  const [transfer] = await sql`SELECT * FROM transfers WHERE id = ${id}`;
  if (!transfer) {
    return NextResponse.json({ error: "找不到調撥單" }, { status: 404 });
  }

  if (action === "return" && returnItems?.length) {
    // CRITICAL: 整個歸還流程包在 transaction 內 + 鎖行 + 範圍檢查
    // 避免：1) returnQty > remaining 造成超還（庫存多出來）
    //       2) 中途失敗部分 commit 造成庫存與 returned_qty 不一致
    try {
      await sql.begin(async (_tx) => {
        const tx = _tx as unknown as typeof sql;

        for (const ri of returnItems) {
          const [ti] = await tx`
            SELECT id, item_id, unit,
                   quantity::numeric as quantity,
                   returned_qty::numeric as returned_qty
            FROM transfer_items WHERE id = ${ri.transferItemId}
            FOR UPDATE
          `;
          if (!ti) continue;

          const quantity = parseFloat(String(ti.quantity));
          const returned = parseFloat(String(ti.returned_qty));
          const remaining = quantity - returned;
          const returnQty = Math.abs(ri.returnQty);

          // CRITICAL: 歸還數量範圍檢查（允許 0.001 浮點誤差）
          if (returnQty <= 0) {
            throw new Error(`歸還數量必須 > 0 (item_id=${ti.item_id})`);
          }
          if (returnQty > remaining + 0.001) {
            throw new Error(
              `歸還數量 ${returnQty} 超過未還 ${remaining}（借 ${quantity}，已還 ${returned}）`
            );
          }

          await tx`
            UPDATE transfer_items SET returned_qty = returned_qty + ${returnQty}
            WHERE id = ${ri.transferItemId}
          `;

          // 歸還 = 從 toStore 扣，加回 fromStore（同樣鎖行避併發）
          const [toExisting] = await tx`
            SELECT id FROM store_inventory
            WHERE item_id = ${ti.item_id} AND store_id = ${transfer.to_store_id}
            FOR UPDATE
          `;
          if (toExisting) {
            await tx`UPDATE store_inventory SET current_stock = current_stock - ${returnQty}, updated_at = NOW() WHERE item_id = ${ti.item_id} AND store_id = ${transfer.to_store_id}`;
          }
          const [fromExisting] = await tx`
            SELECT id FROM store_inventory
            WHERE item_id = ${ti.item_id} AND store_id = ${transfer.from_store_id}
            FOR UPDATE
          `;
          if (fromExisting) {
            await tx`UPDATE store_inventory SET current_stock = current_stock + ${returnQty}, updated_at = NOW() WHERE item_id = ${ti.item_id} AND store_id = ${transfer.from_store_id}`;
          }

          // inventory log
          const [fromStock] = await tx`SELECT current_stock FROM store_inventory WHERE item_id = ${ti.item_id} AND store_id = ${transfer.from_store_id}`;
          const [toStock] = await tx`SELECT current_stock FROM store_inventory WHERE item_id = ${ti.item_id} AND store_id = ${transfer.to_store_id}`;

          await tx`
            INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
            VALUES (${ti.item_id}, 'in', ${returnQty}, ${ti.unit}, ${fromStock?.current_stock || 0}, ${transfer.from_store_id}, ${'歸還 ' + transfer.transfer_number}, ${userId})
          `;
          await tx`
            INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
            VALUES (${ti.item_id}, 'out', ${-returnQty}, ${ti.unit}, ${toStock?.current_stock || 0}, ${transfer.to_store_id}, ${'歸還 ' + transfer.transfer_number}, ${userId})
          `;
        }

        // 檢查是否全部歸還
        const unreturned = await tx`
          SELECT COUNT(*)::int as cnt FROM transfer_items
          WHERE transfer_id = ${id} AND returned_qty < quantity
        `;
        if (unreturned[0].cnt === 0) {
          await tx`UPDATE transfers SET status = 'returned', settled_at = NOW() WHERE id = ${id}`;
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "歸還失敗，已自動回滾";
      const status = msg.includes("歸還數量") ? 400 : 500;
      return NextResponse.json({ error: msg }, { status });
    }

    return NextResponse.json({ success: true, action: "return" });
  }

  if (action === "settle") {
    // 直接沖銷（不歸還，當作消耗或轉讓）
    await sql`UPDATE transfers SET status = 'settled', settled_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ success: true, action: "settle" });
  }

  return NextResponse.json({ error: "無效的操作" }, { status: 400 });
}
