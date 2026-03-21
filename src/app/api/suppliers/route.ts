/**
 * 供應商 API
 * GET /api/suppliers — 讀取供應商列表（含 paymentType）
 * POST /api/suppliers — 新增供應商（支援 paymentType）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  // 取得供應商 + 各供應商的品項數量
  const result = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      category: suppliers.category,
      contact: suppliers.contact,
      phone: suppliers.phone,
      notes: suppliers.notes,
      noDeliveryDays: suppliers.noDeliveryDays,
      leadDays: suppliers.leadDays,
      // CRITICAL: paymentType 影響付款追蹤和月結報表的邏輯
      paymentType: suppliers.paymentType,
      isActive: suppliers.isActive,
      itemsCount: sql<number>`(SELECT COUNT(*) FROM items WHERE items.supplier_id = ${suppliers.id} AND items.is_active = true)`,
    })
    .from(suppliers)
    .where(eq(suppliers.isActive, true))
    .orderBy(suppliers.name);

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, category, contact, phone, notes, noDeliveryDays, leadDays, paymentType } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "供應商名稱不能為空" }, { status: 400 });
  }

  const [newSupplier] = await db
    .insert(suppliers)
    .values({
      name,
      category,
      contact: contact || null,
      phone: phone || null,
      notes: notes || null,
      noDeliveryDays: noDeliveryDays || [],
      leadDays: leadDays || 1,
      // CRITICAL: 預設月結，確保新供應商有正確結帳方式
      paymentType: paymentType || '月結',
    })
    .returning();

  return NextResponse.json(newSupplier, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, name, category, contact, phone, notes, noDeliveryDays, leadDays, paymentType } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少供應商 ID" }, { status: 400 });
  }

  const [updated] = await db
    .update(suppliers)
    .set({
      ...(name && { name }),
      ...(category && { category }),
      contact: contact ?? null,
      phone: phone ?? null,
      notes: notes ?? null,
      ...(noDeliveryDays !== undefined && { noDeliveryDays }),
      ...(leadDays !== undefined && { leadDays }),
      ...(paymentType && { paymentType }),
    })
    .where(eq(suppliers.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "找不到供應商" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
