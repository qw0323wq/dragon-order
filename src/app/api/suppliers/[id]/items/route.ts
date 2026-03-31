/**
 * 供應商品項 API
 * GET  /api/suppliers/[id]/items — 該供應商的所有品項
 * POST /api/suppliers/[id]/items — 新增品項
 * PUT  /api/suppliers/[id]/items — 批次更新（報價單上傳用，自動記錄價格歷史）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, itemPriceHistory } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supplierId = parseInt(id);

  const supplierItems = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      unit: items.unit,
      costPrice: items.costPrice,
      storePrice: items.storePrice,
      sellPrice: items.sellPrice,
      spec: items.spec,
      aliases: items.aliases,
      isActive: items.isActive,
    })
    .from(items)
    .where(eq(items.supplierId, supplierId))
    .orderBy(items.category, items.name);

  return NextResponse.json(supplierItems);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supplierId = parseInt(id);
  const body = await request.json();
  const { name, category, unit, costPrice, storePrice, sellPrice, spec } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "品名不能為空" }, { status: 400 });
  }

  const [newItem] = await db
    .insert(items)
    .values({
      name: name.trim(),
      category: category || "其他",
      unit: unit || "份",
      costPrice: costPrice || 0,
      storePrice: storePrice || 0,
      sellPrice: sellPrice || 0,
      spec: spec || null,
      supplierId,
    })
    .returning();

  return NextResponse.json(newItem, { status: 201 });
}

/**
 * PUT — 批次更新品項（報價單上傳用）
 * Body: { items: [{ name, costPrice, storePrice?, unit?, category?, spec? }] }
 *
 * 邏輯：
 * - 品名匹配到現有品項 → 更新價格
 * - 品名不存在 → 新增
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supplierId = parseInt(id);
  const body = await request.json();
  const { items: uploadItems } = body as {
    items: {
      name: string;
      costPrice: number;
      storePrice?: number;
      unit?: string;
      category?: string;
      spec?: string;
    }[];
  };

  if (!Array.isArray(uploadItems) || uploadItems.length === 0) {
    return NextResponse.json({ error: "請提供品項資料" }, { status: 400 });
  }

  // 讀取該供應商現有品項（含 costPrice 以便比對價差）
  const existing = await db
    .select({ id: items.id, name: items.name, costPrice: items.costPrice, unit: items.unit })
    .from(items)
    .where(eq(items.supplierId, supplierId));

  const nameToItem = new Map(existing.map((e) => [e.name.trim(), e]));

  let updated = 0;
  let created = 0;
  const priceChanges: { name: string; oldPrice: number; newPrice: number; diff: number; pct: string }[] = [];
  const source = (body as { source?: string }).source || undefined;
  const effectiveDate = (body as { effectiveDate?: string }).effectiveDate || new Date().toISOString().slice(0, 10);

  for (const ui of uploadItems) {
    const trimName = ui.name?.trim();
    if (!trimName) continue;

    const existingItem = nameToItem.get(trimName);

    if (existingItem) {
      const oldCost = existingItem.costPrice;
      const newCost = ui.costPrice;

      // 更新價格
      const updates: Record<string, unknown> = { costPrice: newCost };
      if (ui.storePrice !== undefined) updates.storePrice = ui.storePrice;
      if (ui.unit) updates.unit = ui.unit;
      if (ui.spec) updates.spec = ui.spec;
      await db.update(items).set(updates).where(eq(items.id, existingItem.id));
      updated++;

      // 價格有變動 → 記錄到 item_price_history
      if (oldCost !== newCost && oldCost > 0) {
        const diff = newCost - oldCost;
        const pct = ((diff / oldCost) * 100).toFixed(2);
        await db.insert(itemPriceHistory).values({
          itemId: existingItem.id,
          oldPrice: oldCost,
          newPrice: newCost,
          priceDiff: diff,
          changePercent: pct,
          priceUnit: ui.unit || existingItem.unit,
          effectiveDate,
          source: source || null,
        });
        priceChanges.push({ name: trimName, oldPrice: oldCost, newPrice: newCost, diff, pct });
      }
    } else {
      // 新增品項
      await db.insert(items).values({
        name: trimName,
        category: ui.category || "其他",
        unit: ui.unit || "份",
        costPrice: ui.costPrice || 0,
        storePrice: ui.storePrice || 0,
        sellPrice: 0,
        supplierId,
      });
      created++;
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    created,
    priceChanges: priceChanges.length,
    message: `更新 ${updated} 個、新增 ${created} 個品項、${priceChanges.length} 個價格變動已記錄`,
    changes: priceChanges,
  });
}
