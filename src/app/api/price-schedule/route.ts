/**
 * 預約改價排程 API
 * GET  /api/price-schedule — 查詢排程（可選 ?status=pending&item_id=xx&supplier_id=xx）
 * POST /api/price-schedule — 新增排程
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledPriceChanges, items, suppliers } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAdmin, authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const itemId = searchParams.get("item_id");
  const supplierId = searchParams.get("supplier_id");

  const rows = await db
    .select({
      id: scheduledPriceChanges.id,
      itemId: scheduledPriceChanges.itemId,
      itemName: items.name,
      itemSku: items.sku,
      currentCostPrice: items.costPrice,
      currentStorePrice: items.storePrice,
      itemUnit: items.unit,
      supplierName: suppliers.name,
      supplierCode: suppliers.code,
      newCostPrice: scheduledPriceChanges.newCostPrice,
      newStorePrice: scheduledPriceChanges.newStorePrice,
      effectiveDate: scheduledPriceChanges.effectiveDate,
      source: scheduledPriceChanges.source,
      notes: scheduledPriceChanges.notes,
      status: scheduledPriceChanges.status,
      createdAt: scheduledPriceChanges.createdAt,
      appliedAt: scheduledPriceChanges.appliedAt,
    })
    .from(scheduledPriceChanges)
    .innerJoin(items, eq(scheduledPriceChanges.itemId, items.id))
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(
      and(
        status ? eq(scheduledPriceChanges.status, status) : undefined,
        itemId ? eq(scheduledPriceChanges.itemId, parseIntSafe(itemId)!) : undefined,
        supplierId ? eq(items.supplierId, parseIntSafe(supplierId)!) : undefined,
      )
    )
    .orderBy(
      sql`CASE WHEN ${scheduledPriceChanges.status} = 'pending' THEN 0 WHEN ${scheduledPriceChanges.status} = 'applied' THEN 1 ELSE 2 END`,
      scheduledPriceChanges.effectiveDate,
    );

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { itemId, newCostPrice, newStorePrice, effectiveDate, source, notes } = body;

  if (!itemId || newCostPrice === undefined || !effectiveDate) {
    return NextResponse.json(
      { error: "需要 itemId、newCostPrice、effectiveDate" },
      { status: 400 }
    );
  }

  // 確認品項存在
  const [item] = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(eq(items.id, itemId));

  if (!item) {
    return NextResponse.json({ error: "找不到品項" }, { status: 404 });
  }

  const [created] = await db
    .insert(scheduledPriceChanges)
    .values({
      itemId,
      newCostPrice,
      newStorePrice: newStorePrice ?? null,
      effectiveDate,
      source: source || null,
      notes: notes || null,
      status: "pending",
      createdBy: auth.userId ?? null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
