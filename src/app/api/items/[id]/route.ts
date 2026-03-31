/**
 * 單一品項 API
 * PATCH /api/items/[id] — 更新品項（名稱、分類、價格等）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const itemId = parseInt(id);
  const body = await request.json();

  const { name, category, unit, costPrice, storePrice, sellPrice, spec, supplierNotes, isActive } = body as {
    name?: string;
    category?: string;
    unit?: string;
    costPrice?: number;
    storePrice?: number;
    sellPrice?: number;
    spec?: string | null;
    supplierNotes?: string | null;
    isActive?: boolean;
  };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (category !== undefined) updates.category = category;
  if (unit !== undefined) updates.unit = unit;
  if (costPrice !== undefined) updates.costPrice = costPrice;
  if (storePrice !== undefined) updates.storePrice = storePrice;
  if (sellPrice !== undefined) updates.sellPrice = sellPrice;
  if (spec !== undefined) updates.spec = spec;
  if (supplierNotes !== undefined) updates.supplierNotes = supplierNotes;
  if (isActive !== undefined) updates.isActive = isActive;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });
  }

  await db.update(items).set(updates).where(eq(items.id, itemId));
  return NextResponse.json({ success: true });
}

/** DELETE /api/items/[id] — 軟刪除品項 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const itemId = parseInt(id);
  await db.update(items).set({ isActive: false }).where(eq(items.id, itemId));
  return NextResponse.json({ success: true });
}
