/**
 * 供應商 API
 * GET /api/suppliers — 讀取供應商列表
 * POST /api/suppliers — 新增供應商
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, items } from "@/lib/db/schema";
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
  const { name, category, contact, phone, notes, noDeliveryDays, leadDays } = body;

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
    })
    .returning();

  return NextResponse.json(newSupplier, { status: 201 });
}
