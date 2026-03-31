/**
 * 庫存 API（支援分店庫存）
 *
 * GET  /api/inventory                     — 全部彙總
 * GET  /api/inventory?store=hq            — 總公司倉庫
 * GET  /api/inventory?store=1             — 指定門市
 * GET  /api/inventory?view=breakdown      — 各點庫存明細
 * POST /api/inventory                     — 庫存異動（進貨/出貨/撥貨/盤點）
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
  const category = searchParams.get("category");
  const storeParam = searchParams.get("store"); // "hq" | store_id | null(全部)
  const view = searchParams.get("view"); // "breakdown" = 各點明細
  const lowOnly = searchParams.get("low") === "1";

  // 彙總視圖：加總所有地點的庫存
  if (view === "breakdown") {
    // 回傳每個品項在各地點的庫存明細
    const rows = await sql`
      SELECT si.item_id, i.name, i.category, i.unit, i.spec,
             si.store_id, COALESCE(st.name, '總公司倉庫') as location_name,
             si.current_stock, si.stock_unit,
             sup.name as supplier_name
      FROM store_inventory si
      JOIN items i ON si.item_id = i.id
      JOIN suppliers sup ON i.supplier_id = sup.id
      LEFT JOIN stores st ON si.store_id = st.id
      WHERE i.is_active = true
      ${category ? sql`AND i.category = ${category}` : sql``}
      ORDER BY i.category, i.name, si.store_id
    `;
    return NextResponse.json(rows.map(r => ({
      ...r,
      current_stock: parseFloat(r.current_stock as string) || 0,
    })));
  }

  // 單一地點或全部彙總
  let rows;
  if (storeParam) {
    // 指定地點（總公司/林森/信義安和）
    const storeId = parseInt(storeParam);
    rows = await sql`
      SELECT i.id, i.name, i.category, i.unit,
             COALESCE(si.current_stock, 0) as current_stock,
             si.stock_unit,
             i.safety_stock, i.safety_stock_unit, i.spec,
             sup.name as supplier_name
      FROM items i
      JOIN suppliers sup ON i.supplier_id = sup.id
      LEFT JOIN store_inventory si ON si.item_id = i.id AND si.store_id = ${storeId}
      WHERE i.is_active = true
      ${category ? sql`AND i.category = ${category}` : sql``}
      ORDER BY i.category, i.name
    `;
  } else {
    // 全部彙總（加總所有地點）
    rows = await sql`
      SELECT i.id, i.name, i.category, i.unit,
             COALESCE(SUM(si.current_stock::numeric), 0) as current_stock,
             i.safety_stock, i.safety_stock_unit, i.spec,
             sup.name as supplier_name
      FROM items i
      JOIN suppliers sup ON i.supplier_id = sup.id
      LEFT JOIN store_inventory si ON si.item_id = i.id
      WHERE i.is_active = true
      ${category ? sql`AND i.category = ${category}` : sql``}
      GROUP BY i.id, i.name, i.category, i.unit, i.safety_stock, i.safety_stock_unit, i.spec, sup.name
      ORDER BY i.category, i.name
    `;
  }

  const result = rows.map((r) => {
    const current = parseFloat(r.current_stock as string) || 0;
    const safety = parseFloat(r.safety_stock as string) || 0;
    const isLow = safety > 0 && current < safety;
    return { ...r, current_stock: current, safety_stock: safety, isLow };
  });

  if (lowOnly) {
    return NextResponse.json(result.filter((r) => r.isLow));
  }

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
  const { itemId, type, quantity, unit, storeId, source, notes } = body as {
    itemId: number;
    type: "in" | "out" | "adjust" | "transfer";
    quantity: number;
    unit?: string;
    storeId: number;
    source?: string;
    notes?: string;
  };

  if (!itemId || !type || quantity === undefined || !storeId) {
    return NextResponse.json(
      { error: "需要 itemId, type, quantity, storeId" },
      { status: 400 }
    );
  }

  // 確認品項存在
  const [item] = await sql`SELECT name FROM items WHERE id = ${itemId}`;
  if (!item) {
    return NextResponse.json({ error: "品項不存在" }, { status: 404 });
  }

  // 撥貨模式（總倉→分店 或 分店→分店）
  if (type === "transfer") {
    const { toStoreId } = body as { toStoreId?: number };
    if (!toStoreId) {
      return NextResponse.json({ error: "撥貨需要 toStoreId" }, { status: 400 });
    }

    const transferQty = Math.abs(quantity);

    // 從來源扣庫存
    await upsertStoreStock(itemId, storeId, -transferQty, unit);
    // 到目標加庫存
    await upsertStoreStock(itemId, toStoreId, transferQty, unit);

    // 取得最新庫存
    const fromStock = await getStoreStock(itemId, storeId);
    const toStock = await getStoreStock(itemId, toStoreId);

    // 記錄兩筆 log
    await sql`
      INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, notes, created_by)
      VALUES (${itemId}, 'out', ${-transferQty}, ${unit || null}, ${fromStock}, ${storeId}, ${source || '撥貨轉出'}, ${notes || null}, ${userId})
    `;
    await sql`
      INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, notes, created_by)
      VALUES (${itemId}, 'in', ${transferQty}, ${unit || null}, ${toStock}, ${toStoreId}, ${source || '撥貨轉入'}, ${notes || null}, ${userId})
    `;

    // 更新 items.current_stock（全部加總）
    await syncItemTotalStock(itemId);

    return NextResponse.json({
      ok: true,
      itemName: item.name,
      type: "transfer",
      quantity: transferQty,
      fromStock,
      toStock,
    });
  }

  // 一般進出貨/盤點
  const currentStock = await getStoreStock(itemId, storeId);

  let change: number;
  if (type === "in") {
    change = Math.abs(quantity);
  } else if (type === "out") {
    change = -Math.abs(quantity);
  } else {
    change = quantity - currentStock;
  }

  const newStock = type === "adjust" ? quantity : currentStock + change;

  // 更新分店庫存
  await upsertStoreStock(itemId, storeId, change, unit, type === "adjust" ? quantity : undefined);

  // 記錄異動
  await sql`
    INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, notes, created_by)
    VALUES (${itemId}, ${type}, ${change}, ${unit || null}, ${newStock}, ${storeId}, ${source || null}, ${notes || null}, ${userId})
  `;

  // 同步 items.current_stock
  await syncItemTotalStock(itemId);

  return NextResponse.json({
    ok: true,
    itemName: item.name,
    type,
    change,
    newStock,
  });
}

// ── 輔助函式 ──

/** 取得某品項在某地點的庫存 */
async function getStoreStock(itemId: number, storeId: number): Promise<number> {
  const [row] = await sql`SELECT current_stock FROM store_inventory WHERE item_id = ${itemId} AND store_id = ${storeId}`;
  return parseFloat(row?.current_stock as string) || 0;
}

/** 更新或新增某品項在某地點的庫存 */
async function upsertStoreStock(
  itemId: number,
  storeId: number,
  change: number,
  unit?: string,
  absoluteValue?: number
) {
  const [existing] = await sql`SELECT id FROM store_inventory WHERE item_id = ${itemId} AND store_id = ${storeId}`;
  if (existing) {
    if (absoluteValue !== undefined) {
      await sql`UPDATE store_inventory SET current_stock = ${absoluteValue}, updated_at = NOW() WHERE item_id = ${itemId} AND store_id = ${storeId}`;
    } else {
      await sql`UPDATE store_inventory SET current_stock = current_stock + ${change}, updated_at = NOW() WHERE item_id = ${itemId} AND store_id = ${storeId}`;
    }
  } else {
    const value = absoluteValue !== undefined ? absoluteValue : Math.max(0, change);
    await sql`INSERT INTO store_inventory (item_id, store_id, current_stock, stock_unit) VALUES (${itemId}, ${storeId}, ${value}, ${unit || null})`;
  }
}

/** 同步 items.current_stock = 所有地點加總 */
async function syncItemTotalStock(itemId: number) {
  const [{ total }] = await sql`
    SELECT COALESCE(SUM(current_stock::numeric), 0) as total
    FROM store_inventory WHERE item_id = ${itemId}
  `;
  await sql`UPDATE items SET current_stock = ${total} WHERE id = ${itemId}`;
}
