/**
 * 付款 API
 * GET /api/payments?month=2026-03 — 取得月結報表資料
 * POST /api/payments — 建立付款紀錄
 * PATCH /api/payments — 更新付款狀態（標記已付款）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payments, orders, orderItems, suppliers, items } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // 格式：2026-03

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
  // 使用 SQL 聚合：按供應商分組取得訂單金額
  const supplierAmounts = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      paymentType: suppliers.paymentType,
      orderCount: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`,
      totalAmount: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)`,
    })
    .from(orderItems)
    .innerJoin(items, eq(orderItems.itemId, items.id))
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(
      sql`${orderItems.orderId} = ANY(ARRAY[${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
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
    const unpaidAmount = totalAmount - paidAmount - pendingAmount;

    return {
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      paymentType: s.paymentType,
      orderCount: Number(s.orderCount),
      totalAmount,
      paidAmount,
      pendingAmount,
      unpaidAmount: Math.max(0, unpaidAmount),
      // 付款紀錄
      payments: supplierPayments,
    };
  });

  // 整體摘要
  const summary = {
    totalAmount: supplierReport.reduce((sum, s) => sum + s.totalAmount, 0),
    paidAmount: supplierReport.reduce((sum, s) => sum + s.paidAmount, 0),
    unpaidAmount: supplierReport.reduce((sum, s) => sum + s.unpaidAmount, 0),
  };

  return NextResponse.json({ month, suppliers: supplierReport, summary });
}

export async function POST(request: NextRequest) {
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
  const body = await request.json();
  const { paymentId, status, notes } = body;

  if (!paymentId || !status) {
    return NextResponse.json({ error: "缺少 paymentId 或 status" }, { status: 400 });
  }

  const validStatuses = ["unpaid", "pending", "paid"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "無效的付款狀態" }, { status: 400 });
  }

  const [updated] = await db
    .update(payments)
    .set({
      status,
      paidAt: status === "paid" ? new Date() : null,
      notes: notes ?? undefined,
    })
    .where(eq(payments.id, paymentId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "找不到付款紀錄" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
