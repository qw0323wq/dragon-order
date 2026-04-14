/**
 * 訂單 API
 * GET /api/orders — 讀取訂單列表
 * POST /api/orders — 建立/更新訂單（員工叫貨送出）
 */
import { NextRequest, NextResponse } from "next/server";
import { db, rawSql } from "@/lib/db";
import { orders, orderItems, items, stores, suppliers } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateRequest, getStoreScope } from "@/lib/api-auth";
import { createOrderSchema, parseBody } from "@/lib/validations";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const storeScope = getStoreScope(request, auth);
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date"); // YYYY-MM-DD
  const limit = parseInt(searchParams.get("limit") ?? "10");

  // manager/staff 只看自己門市的訂單
  if (storeScope) {
    // 找出包含該門市 order_items 的訂單
    const result = await rawSql`
      SELECT DISTINCT o.* FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE oi.store_id = ${storeScope}
      ${date ? rawSql`AND o.order_date = ${date}` : rawSql``}
      ORDER BY o.order_date DESC, o.created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json(result);
  }

  const baseQuery = db.select().from(orders);
  const result = date
    ? await baseQuery.where(eq(orders.orderDate, date)).orderBy(desc(orders.createdAt)).limit(limit)
    : await baseQuery.orderBy(desc(orders.orderDate)).limit(limit);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const parsed = parseBody(createOrderSchema, body);
  if (!parsed.ok) return parsed.response;
  const { storeId, items: cartItems, orderDate: customDate } = parsed.data;

  // CRITICAL: userId 從認證結果取得，不信任 body（防止冒充他人下單）
  const userId = auth.userId ?? null;

  // 使用指定日期或今天
  const targetDate = customDate || new Date().toISOString().slice(0, 10);

  // 查看該日期是否已有 draft 訂單
  const [existingOrder] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderDate, targetDate), eq(orders.status, "draft")))
    .limit(1);

  let orderId: number;

  if (existingOrder) {
    orderId = existingOrder.id;
  } else {
    // 建立新訂單
    const [newOrder] = await db
      .insert(orders)
      .values({
        orderDate: targetDate,
        status: "draft",
        createdBy: userId,
      })
      .returning();
    orderId = newOrder.id;
  }

  // CRITICAL: 從 DB 查真實 cost_price，不信任前端傳的 unitPrice（員工/店長角色可能為 0）
  const itemIds = cartItems.map((item) => item.itemId);
  const dbItems = await db
    .select({ id: items.id, costPrice: items.costPrice })
    .from(items)
    .where(sql`${items.id} IN ${itemIds}`);
  const priceMap = new Map(dbItems.map((i) => [i.id, i.costPrice]));

  // 寫入訂單明細（記錄叫貨人）
  const orderItemValues = cartItems.map((item) => {
    const realPrice = priceMap.get(item.itemId) ?? 0;
    return {
      orderId,
      itemId: item.itemId,
      storeId,
      quantity: String(item.quantity),
      unit: item.unit,
      unitPrice: realPrice,
      subtotal: Math.round(item.quantity * realPrice),
      createdBy: userId,
    };
  });

  await db.insert(orderItems).values(orderItemValues);

  // 更新訂單總額
  const [totalResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)` })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  await db
    .update(orders)
    .set({ totalAmount: Number(totalResult.total), updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  return NextResponse.json({ success: true, orderId });
}
