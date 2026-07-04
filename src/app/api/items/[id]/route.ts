/**
 * 單一品項 API
 * PATCH /api/items/[id] — 更新品項（名稱、分類、價格等）
 */
import { NextRequest, NextResponse } from "next/server";
import { db, rawSql } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireBuyerOrAbove } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBuyerOrAbove(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const itemId = parseIntSafe(id);
  if (itemId === null) {
    return NextResponse.json({ error: "無效的品項 ID" }, { status: 400 });
  }
  const body = await request.json();

  const { name, category, unit, costPrice, storePrice, storeMarkupPct, sellPrice, spec, supplierNotes, isActive } = body as {
    name?: string;
    category?: string;
    unit?: string;
    costPrice?: number;
    storePrice?: number;
    storeMarkupPct?: number;
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
  if (storeMarkupPct !== undefined) updates.storeMarkupPct = storeMarkupPct;
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

/**
 * DELETE /api/items/[id]
 *   預設         → 軟刪除（下架，isActive=false），保留所有歷史，可重新上架
 *   ?hard=1     → 真刪除（硬刪 DB 列），只允許在「完全沒被任何表引用」時。
 *
 * CRITICAL: 真刪除前一定要逐表檢查引用再刪。items 有 3 張 cascade 子表
 * （item_price_history / scheduled_price_changes / inventory_logs），直接硬刪會
 * 「靜默」連帶刪掉價格與庫存歷史；其餘為 restrict/no-action 會擋下但報 500。
 * 所以這裡一律先數引用，有任何一筆就擋，回 409 叫使用者改用下架。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBuyerOrAbove(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const itemId = parseIntSafe(id);
  if (itemId === null) {
    return NextResponse.json({ error: "無效的品項 ID" }, { status: 400 });
  }

  const hard = new URL(request.url).searchParams.get("hard") === "1";

  // 預設：軟刪除（下架）
  if (!hard) {
    await db.update(items).set({ isActive: false }).where(eq(items.id, itemId));
    return NextResponse.json({ success: true, mode: "soft" });
  }

  // 真刪除：逐表數引用，全 0 才允許硬刪
  const [refs] = (await rawSql`
    SELECT
      (SELECT COUNT(*) FROM order_items            WHERE item_id = ${itemId})::int AS orders,
      (SELECT COUNT(*) FROM bom_items              WHERE item_id = ${itemId})::int AS bom,
      (SELECT COUNT(*) FROM store_inventory        WHERE item_id = ${itemId})::int AS inventory,
      (SELECT COUNT(*) FROM transfer_items         WHERE item_id = ${itemId})::int AS transfers,
      (SELECT COUNT(*) FROM purchase_order_items   WHERE item_id = ${itemId})::int AS purchase_orders,
      (SELECT COUNT(*) FROM item_price_history     WHERE item_id = ${itemId})::int AS price_history,
      (SELECT COUNT(*) FROM scheduled_price_changes WHERE item_id = ${itemId})::int AS price_schedule,
      (SELECT COUNT(*) FROM inventory_logs         WHERE item_id = ${itemId})::int AS inv_logs,
      (SELECT COUNT(*) FROM purchase_request_items WHERE suggested_item_id = ${itemId} OR chosen_item_id = ${itemId})::int AS requests
  `) as unknown as Array<Record<string, number>>;

  const blockers: string[] = [];
  if (refs.orders > 0) blockers.push("歷史訂單");
  if (refs.bom > 0) blockers.push("BOM 配方");
  if (refs.inventory > 0) blockers.push("庫存");
  if (refs.transfers > 0) blockers.push("調撥/借料");
  if (refs.purchase_orders > 0) blockers.push("叫貨單");
  if (refs.price_history > 0) blockers.push("價格紀錄");
  if (refs.price_schedule > 0) blockers.push("預約改價");
  if (refs.inv_logs > 0) blockers.push("庫存異動紀錄");
  if (refs.requests > 0) blockers.push("採購需求");

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error: `此品項已有關聯資料（${blockers.join("、")}），無法真刪除。請改用「下架」保留歷史。`,
        blockers,
      },
      { status: 409 }
    );
  }

  await db.delete(items).where(eq(items.id, itemId));
  return NextResponse.json({ success: true, mode: "hard" });
}
