/**
 * PUT /api/transfers/[id] — 歸還/沖銷借料
 */
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { authenticateRequest } from "@/lib/api-auth";
import { verifySession } from "@/lib/session";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id: idStr } = await params;
  const id = parseInt(idStr);

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
    // 歸還借料：更新歸還數量 + 反向庫存異動
    for (const ri of returnItems) {
      const [ti] = await sql`SELECT * FROM transfer_items WHERE id = ${ri.transferItemId}`;
      if (!ti) continue;

      const returnQty = Math.abs(ri.returnQty);
      await sql`
        UPDATE transfer_items SET returned_qty = returned_qty + ${returnQty}
        WHERE id = ${ri.transferItemId}
      `;

      // 歸還 = 從 toStore 扣，加回 fromStore
      const [toExisting] = await sql`SELECT id FROM store_inventory WHERE item_id = ${ti.item_id} AND store_id = ${transfer.to_store_id}`;
      if (toExisting) {
        await sql`UPDATE store_inventory SET current_stock = current_stock - ${returnQty}, updated_at = NOW() WHERE item_id = ${ti.item_id} AND store_id = ${transfer.to_store_id}`;
      }
      const [fromExisting] = await sql`SELECT id FROM store_inventory WHERE item_id = ${ti.item_id} AND store_id = ${transfer.from_store_id}`;
      if (fromExisting) {
        await sql`UPDATE store_inventory SET current_stock = current_stock + ${returnQty}, updated_at = NOW() WHERE item_id = ${ti.item_id} AND store_id = ${transfer.from_store_id}`;
      }

      // log
      const [fromStock] = await sql`SELECT current_stock FROM store_inventory WHERE item_id = ${ti.item_id} AND store_id = ${transfer.from_store_id}`;
      const [toStock] = await sql`SELECT current_stock FROM store_inventory WHERE item_id = ${ti.item_id} AND store_id = ${transfer.to_store_id}`;

      await sql`
        INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
        VALUES (${ti.item_id}, 'in', ${returnQty}, ${ti.unit}, ${fromStock?.current_stock || 0}, ${transfer.from_store_id}, ${'歸還 ' + transfer.transfer_number}, ${userId})
      `;
      await sql`
        INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
        VALUES (${ti.item_id}, 'out', ${-returnQty}, ${ti.unit}, ${toStock?.current_stock || 0}, ${transfer.to_store_id}, ${'歸還 ' + transfer.transfer_number}, ${userId})
      `;
    }

    // 檢查是否全部歸還
    const unreturned = await sql`
      SELECT COUNT(*)::int as cnt FROM transfer_items
      WHERE transfer_id = ${id} AND returned_qty < quantity
    `;
    if (unreturned[0].cnt === 0) {
      await sql`UPDATE transfers SET status = 'returned', settled_at = NOW() WHERE id = ${id}`;
    }

    return NextResponse.json({ ok: true, action: "return" });
  }

  if (action === "settle") {
    // 直接沖銷（不歸還，當作消耗或轉讓）
    await sql`UPDATE transfers SET status = 'settled', settled_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ ok: true, action: "settle" });
  }

  return NextResponse.json({ error: "無效的操作" }, { status: 400 });
}
