/**
 * 單一訂單 API — 含明細（彙總/拆單用）
 * GET /api/orders/[id] — 讀取訂單 + 明細 + 供應商
 * PATCH /api/orders/[id] — 更新訂單狀態
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, items, stores, suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, requireAdmin } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const orderId = parseInt(id);

  // 取得訂單
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  }

  // 取得訂單明細（含品項、供應商、門市名稱）
  const details = await db
    .select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      unit: orderItems.unit,
      unitPrice: orderItems.unitPrice,
      subtotal: orderItems.subtotal,
      notes: orderItems.notes,
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
    .where(eq(orderItems.orderId, orderId));

  return NextResponse.json({ order, details });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await request.json();
  const { status } = body as { status: string };

  const validStatuses = ["draft", "confirmed", "ordered", "received", "closed"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "無效的狀態" }, { status: 400 });
  }

  await db
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  return NextResponse.json({ success: true });
}
