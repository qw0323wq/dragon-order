/**
 * 驗收 API
 * GET /api/receiving?orderId=xxx — 讀取某訂單的驗收狀態
 * POST /api/receiving — 寫入/更新驗收紀錄
 */
import { NextRequest, NextResponse } from "next/server";
import { db, rawSql } from "@/lib/db";
import { receiving, orderItems, items, stores, suppliers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { authenticateRequest, requireManagerOrAbove } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "缺少 orderId" }, { status: 400 });
  }

  const parsedOrderId = parseIntSafe(orderId);
  if (parsedOrderId === null) {
    return NextResponse.json({ error: "無效的訂單 ID" }, { status: 400 });
  }

  // 取得該訂單的所有明細 + 對應的驗收紀錄
  const details = await db
    .select({
      orderItemId: orderItems.id,
      quantity: orderItems.quantity,
      unit: orderItems.unit,
      unitPrice: orderItems.unitPrice,
      subtotal: orderItems.subtotal,
      itemName: items.name,
      itemCategory: items.category,
      supplierName: suppliers.name,
      supplierId: suppliers.id,
      storeName: stores.name,
      storeId: stores.id,
    })
    .from(orderItems)
    .innerJoin(items, eq(orderItems.itemId, items.id))
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .innerJoin(stores, eq(orderItems.storeId, stores.id))
    .where(eq(orderItems.orderId, parsedOrderId));

  if (details.length === 0) {
    return NextResponse.json({ details: [], receivings: [] });
  }

  // 取得已驗收的紀錄
  const orderItemIds = details.map((d) => d.orderItemId);
  const receivings = await db
    .select()
    .from(receiving)
    .where(inArray(receiving.orderItemId, orderItemIds));

  return NextResponse.json({ details, receivings });
}

export async function POST(request: NextRequest) {
  // CRITICAL: 驗收操作需要 manager 以上權限
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;

  // CRITICAL: 從認證結果取得驗收人 ID（個人 token 或 cookie session 都有值）
  const receivedByUserId = auth.userId ?? null;

  const body = await request.json();

  // 支援批次驗收
  const records = body.records as Array<{
    orderItemId: number;
    receivedQty: string;
    result: string;
    issue?: string;
    resolution?: string;
    receivedBy?: number;
  }>;

  if (!records?.length) {
    return NextResponse.json({ error: "缺少驗收資料" }, { status: 400 });
  }

  const now = new Date();
  const results = [];

  for (const rec of records) {
    // 先查是否已有驗收紀錄
    const [existing] = await db
      .select()
      .from(receiving)
      .where(eq(receiving.orderItemId, rec.orderItemId))
      .limit(1);

    // 驗收人：優先用 auth 取得的 userId，其次用前端傳入的 receivedBy
    const resolvedReceivedBy = receivedByUserId ?? rec.receivedBy ?? null;

    if (existing) {
      // 更新既有紀錄
      const [updated] = await db
        .update(receiving)
        .set({
          receivedQty: rec.receivedQty,
          result: rec.result,
          issue: rec.issue || null,
          resolution: rec.resolution || null,
          receivedAt: now,
          receivedBy: resolvedReceivedBy,
        })
        .where(eq(receiving.orderItemId, rec.orderItemId))
        .returning();
      results.push(updated);
    } else {
      // 新增驗收紀錄
      const [inserted] = await db
        .insert(receiving)
        .values({
          orderItemId: rec.orderItemId,
          receivedQty: rec.receivedQty,
          result: rec.result,
          issue: rec.issue || null,
          resolution: rec.resolution || null,
          receivedAt: now,
          receivedBy: resolvedReceivedBy,
        })
        .returning();
      results.push(inserted);
    }
  }

  // 驗收完成自動入庫存（正常的品項）
  for (const rec of records) {
    if (rec.result !== '正常' && rec.result !== undefined) continue;

    // 查 order_item 的品項和門市
    const [oi] = await db.select({
      itemId: orderItems.itemId,
      storeId: orderItems.storeId,
      unit: orderItems.unit,
    }).from(orderItems).where(eq(orderItems.id, rec.orderItemId));
    if (!oi) continue;

    const qty = parseFloat(rec.receivedQty) || 0;
    if (qty <= 0) continue;

    // upsert store_inventory
    const [existing] = await rawSql`
      SELECT id FROM store_inventory WHERE item_id = ${oi.itemId} AND store_id = ${oi.storeId}
    `;
    if (existing) {
      await rawSql`
        UPDATE store_inventory SET current_stock = current_stock + ${qty}, updated_at = NOW()
        WHERE item_id = ${oi.itemId} AND store_id = ${oi.storeId}
      `;
    } else {
      await rawSql`
        INSERT INTO store_inventory (item_id, store_id, current_stock, stock_unit)
        VALUES (${oi.itemId}, ${oi.storeId}, ${qty}, ${oi.unit})
      `;
    }

    // 同步 items.current_stock
    const [{ total }] = await rawSql`
      SELECT COALESCE(SUM(current_stock::numeric), 0) as total
      FROM store_inventory WHERE item_id = ${oi.itemId}
    `;
    await rawSql`UPDATE items SET current_stock = ${total} WHERE id = ${oi.itemId}`;

    // 記 inventory_log
    const [stockRow] = await rawSql`
      SELECT current_stock FROM store_inventory WHERE item_id = ${oi.itemId} AND store_id = ${oi.storeId}
    `;
    await rawSql`
      INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
      VALUES (${oi.itemId}, 'in', ${qty}, ${oi.unit}, ${stockRow?.current_stock || qty}, ${oi.storeId}, '驗收入庫', ${receivedByUserId})
    `;
  }

  return NextResponse.json({ success: true, count: results.length });
}
