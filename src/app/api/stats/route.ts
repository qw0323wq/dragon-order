/**
 * 統計 API
 * GET /api/stats?month=2026-03 — 月度統計
 *
 * 回傳：
 * - topItems: 品項排行（叫最多的）
 * - topSuppliers: 供應商消費排行
 * - dailyTrend: 每日採購金額趨勢
 * - summary: 月度摘要（總額、品項數、訂單數）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, items, suppliers, stores } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { authenticateRequest } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // YYYY-MM
  const storeId = searchParams.get("storeId"); // 篩選門市（可選）

  if (!month) {
    return NextResponse.json({ error: "缺少 month 參數" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const endDate = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;

  // 該月所有訂單 ID
  const monthOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(gte(orders.orderDate, startDate), lte(orders.orderDate, endDate)));

  if (monthOrders.length === 0) {
    return NextResponse.json({
      month,
      topItems: [],
      topSuppliers: [],
      dailyTrend: [],
      summary: { totalAmount: 0, itemCount: 0, orderCount: 0 },
    });
  }

  const orderIds = monthOrders.map((o) => o.id);
  const orderIdFilter = sql`${orderItems.orderId} = ANY(ARRAY[${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)}]::int[])`;
  const storeFilter = storeId ? sql` AND ${orderItems.storeId} = ${parseInt(storeId)}` : sql``;

  // 品項排行（叫最多的前 20）
  const topItems = await db
    .select({
      itemId: items.id,
      itemName: items.name,
      category: items.category,
      supplierName: suppliers.name,
      unit: items.unit,
      totalQty: sql<number>`COALESCE(SUM(CAST(${orderItems.quantity} AS NUMERIC)), 0)`,
      totalAmount: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
      orderCount: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`,
    })
    .from(orderItems)
    .innerJoin(items, eq(orderItems.itemId, items.id))
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(sql`${orderIdFilter}${storeFilter}`)
    .groupBy(items.id, items.name, items.category, suppliers.name, items.unit)
    .orderBy(desc(sql`SUM(CAST(${orderItems.quantity} AS NUMERIC))`))
    .limit(20);

  // 供應商消費排行
  const topSuppliers = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      category: suppliers.category,
      totalAmount: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
      itemCount: sql<number>`COUNT(DISTINCT ${orderItems.itemId})`,
    })
    .from(orderItems)
    .innerJoin(items, eq(orderItems.itemId, items.id))
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(sql`${orderIdFilter}${storeFilter}`)
    .groupBy(suppliers.id, suppliers.name, suppliers.category)
    .orderBy(desc(sql`SUM(${orderItems.subtotal})`));

  // 每日採購金額趨勢
  const dailyTrend = await db
    .select({
      date: orders.orderDate,
      totalAmount: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
      itemCount: sql<number>`COUNT(${orderItems.id})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      sql`${orderIdFilter}${storeFilter} AND ${orders.orderDate} >= ${startDate} AND ${orders.orderDate} <= ${endDate}`
    )
    .groupBy(orders.orderDate)
    .orderBy(orders.orderDate);

  // 月度摘要
  const totalAmount = topSuppliers.reduce((sum, s) => sum + Number(s.totalAmount), 0);
  const itemCount = topItems.length;
  const orderCount = monthOrders.length;

  return NextResponse.json({
    month,
    topItems: topItems.map((t) => ({
      ...t,
      totalQty: Number(t.totalQty),
      totalAmount: Number(t.totalAmount),
      orderCount: Number(t.orderCount),
    })),
    topSuppliers: topSuppliers.map((s) => ({
      ...s,
      totalAmount: Number(s.totalAmount),
      itemCount: Number(s.itemCount),
    })),
    dailyTrend: dailyTrend.map((d) => ({
      date: d.date,
      totalAmount: Number(d.totalAmount),
      itemCount: Number(d.itemCount),
    })),
    summary: { totalAmount, itemCount, orderCount },
  });
}
