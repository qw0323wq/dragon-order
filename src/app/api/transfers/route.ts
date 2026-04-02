/**
 * 門市調撥/借料 API
 *
 * GET  /api/transfers              — 查詢調撥紀錄
 * POST /api/transfers              — 新增調撥/借料
 */
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { authenticateRequest } from "@/lib/api-auth";
import { verifySession } from "@/lib/session";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // pending|confirmed|returned|settled
  const storeId = searchParams.get("store_id"); // 只看某店相關

  let rows;
  if (storeId) {
    const sid = parseInt(storeId);
    rows = await sql`
      SELECT t.*,
             fs.name as from_store_name, ts.name as to_store_name,
             u.name as created_by_name
      FROM transfers t
      JOIN stores fs ON t.from_store_id = fs.id
      JOIN stores ts ON t.to_store_id = ts.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE (t.from_store_id = ${sid} OR t.to_store_id = ${sid})
      ${status ? sql`AND t.status = ${status}` : sql``}
      ORDER BY t.created_at DESC
      LIMIT 100
    `;
  } else {
    rows = await sql`
      SELECT t.*,
             fs.name as from_store_name, ts.name as to_store_name,
             u.name as created_by_name
      FROM transfers t
      JOIN stores fs ON t.from_store_id = fs.id
      JOIN stores ts ON t.to_store_id = ts.id
      LEFT JOIN users u ON t.created_by = u.id
      ${status ? sql`WHERE t.status = ${status}` : sql``}
      ORDER BY t.created_at DESC
      LIMIT 100
    `;
  }

  // 一次查出所有調撥明細（避免 N+1）
  const transferIds = rows.map((t) => t.id);
  const allItems = transferIds.length > 0
    ? await sql`
        SELECT ti.*, i.name as item_name, i.unit as item_unit
        FROM transfer_items ti
        JOIN items i ON ti.item_id = i.id
        WHERE ti.transfer_id = ANY(${transferIds})
      `
    : ([] as Record<string, unknown>[]);

  // 按 transfer_id 分組
  const itemsByTransfer = new Map<number, Record<string, unknown>[]>();
  for (const item of allItems) {
    const tid = item.transfer_id as number;
    const list = itemsByTransfer.get(tid) ?? [];
    list.push(item);
    itemsByTransfer.set(tid, list);
  }

  const result = rows.map((t) => ({
    ...t,
    items: (itemsByTransfer.get(t.id as number) ?? []).map((i) => ({
      ...i,
      quantity: parseFloat(i.quantity as string) || 0,
      returned_qty: parseFloat(i.returned_qty as string) || 0,
    })),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  let userId: number | null = null;
  if (auth.source === "cookie") {
    const session = verifySession<{ id: number }>(
      request.cookies.get("dragon-session")?.value || ""
    );
    userId = session?.id ?? null;
  }

  const body = await request.json();
  const { type, fromStoreId, toStoreId, items, notes } = body as {
    type: "transfer" | "borrow";
    fromStoreId: number;
    toStoreId: number;
    items: { itemId: number; quantity: number; unit?: string }[];
    notes?: string;
  };

  if (!type || !fromStoreId || !toStoreId || !items?.length) {
    return NextResponse.json(
      { error: "需要 type, fromStoreId, toStoreId, items" },
      { status: 400 }
    );
  }

  if (fromStoreId === toStoreId) {
    return NextResponse.json(
      { error: "來源和目標不能相同" },
      { status: 400 }
    );
  }

  // 產生調撥單號
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const [{ count }] = await sql`
    SELECT COUNT(*)::int as count FROM transfers
    WHERE transfer_number LIKE ${"TR-" + today + "%"}
  `;
  const seq = String(count + 1).padStart(3, "0");
  const transferNumber = `TR-${today}-${seq}`;

  // 建立調撥單
  const [transfer] = await sql`
    INSERT INTO transfers (transfer_number, type, from_store_id, to_store_id, status, notes, created_by)
    VALUES (${transferNumber}, ${type}, ${fromStoreId}, ${toStoreId}, 'confirmed', ${notes || null}, ${userId})
    RETURNING id
  `;

  // 建立明細 + 更新庫存
  for (const item of items) {
    await sql`
      INSERT INTO transfer_items (transfer_id, item_id, quantity, unit)
      VALUES (${transfer.id}, ${item.itemId}, ${item.quantity}, ${item.unit || null})
    `;

    // 來源扣庫存
    const [fromExisting] = await sql`
      SELECT id FROM store_inventory WHERE item_id = ${item.itemId} AND store_id = ${fromStoreId}
    `;
    if (fromExisting) {
      await sql`UPDATE store_inventory SET current_stock = current_stock - ${item.quantity}, updated_at = NOW() WHERE item_id = ${item.itemId} AND store_id = ${fromStoreId}`;
    }

    // 目標加庫存
    const [toExisting] = await sql`
      SELECT id FROM store_inventory WHERE item_id = ${item.itemId} AND store_id = ${toStoreId}
    `;
    if (toExisting) {
      await sql`UPDATE store_inventory SET current_stock = current_stock + ${item.quantity}, updated_at = NOW() WHERE item_id = ${item.itemId} AND store_id = ${toStoreId}`;
    } else {
      await sql`INSERT INTO store_inventory (item_id, store_id, current_stock, stock_unit) VALUES (${item.itemId}, ${toStoreId}, ${item.quantity}, ${item.unit || null})`;
    }

    // 記錄庫存異動 log
    const [fromStock] = await sql`SELECT current_stock FROM store_inventory WHERE item_id = ${item.itemId} AND store_id = ${fromStoreId}`;
    const [toStock] = await sql`SELECT current_stock FROM store_inventory WHERE item_id = ${item.itemId} AND store_id = ${toStoreId}`;

    const label = type === "borrow" ? "借料" : "調撥";
    await sql`
      INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
      VALUES (${item.itemId}, 'out', ${-item.quantity}, ${item.unit || null}, ${fromStock?.current_stock || 0}, ${fromStoreId}, ${label + '轉出 ' + transferNumber}, ${userId})
    `;
    await sql`
      INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
      VALUES (${item.itemId}, 'in', ${item.quantity}, ${item.unit || null}, ${toStock?.current_stock || 0}, ${toStoreId}, ${label + '轉入 ' + transferNumber}, ${userId})
    `;
  }

  return NextResponse.json({
    success: true,
    transferNumber,
    id: transfer.id,
    type,
    itemCount: items.length,
  });
}
