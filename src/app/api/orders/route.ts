/**
 * 訂單 API
 * GET /api/orders — 讀取訂單列表
 * POST /api/orders — 建立/更新訂單（員工叫貨送出）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, items, stores, suppliers } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateRequest, getStoreScope } from "@/lib/api-auth";

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
    const pgSql = (await import("postgres")).default(process.env.DATABASE_URL!, { prepare: false });
    const result = await pgSql`
      SELECT DISTINCT o.* FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE oi.store_id = ${storeScope}
      ${date ? pgSql`AND o.order_date = ${date}` : pgSql``}
      ORDER BY o.order_date DESC, o.created_at DESC
      LIMIT ${limit}
    `;
    await pgSql.end();
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
  const { storeId, items: cartItems, userId, orderDate: customDate } = body as {
    storeId: number;
    items: Array<{ itemId: number; quantity: number; unit: string; unitPrice: number }>;
    userId: number;
    orderDate?: string; // 可指定日期（補 key 過去訂單用）
  };

  if (!storeId || !cartItems?.length) {
    return NextResponse.json({ error: "缺少門市或品項" }, { status: 400 });
  }

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

  // 寫入訂單明細（記錄叫貨人）
  const orderItemValues = cartItems.map((item) => ({
    orderId,
    itemId: item.itemId,
    storeId,
    quantity: String(item.quantity),
    unit: item.unit,
    unitPrice: item.unitPrice,
    subtotal: Math.round(item.quantity * item.unitPrice),
    createdBy: userId || null,
  }));

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
