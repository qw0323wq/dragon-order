/**
 * 驗收 API
 * GET /api/receiving?orderId=xxx — 讀取某訂單的驗收狀態
 * POST /api/receiving — 寫入/更新驗收紀錄
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receiving, orderItems, items, stores, suppliers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { authenticateRequest } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "缺少 orderId" }, { status: 400 });
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
    .where(eq(orderItems.orderId, parseInt(orderId)));

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
  const auth = authenticateRequest(request);
  if (!auth.ok) return auth.response;

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
          receivedBy: rec.receivedBy || null,
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
          receivedBy: rec.receivedBy || null,
        })
        .returning();
      results.push(inserted);
    }
  }

  return NextResponse.json({ success: true, count: results.length });
}
