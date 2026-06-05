/**
 * 單一採購需求
 *
 * GET    /api/purchase-requests/[id]
 *        → 需求 detail（含 items + 每個食材的所有可選 SKU 比價）
 *
 * PATCH  /api/purchase-requests/[id]
 *        Body: { status?, items?: [{ id, chosenItemId, neededQty? }], notes? }
 *        → 改狀態（cancelled）or 修改老闆選的 chosen_item_id / 數量
 *
 * DELETE /api/purchase-requests/[id]
 *        → 刪除（仅未處理的）
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest, requireManagerOrAbove } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const reqId = parseIntSafe(id);
  if (reqId === null) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  const [req] = (await sql`
    SELECT pr.*, s.name as store_name, u.name as creator_name
    FROM purchase_requests pr
    JOIN stores s ON pr.store_id = s.id
    LEFT JOIN users u ON pr.created_by = u.id
    WHERE pr.id = ${reqId}
  `) as unknown as Array<Record<string, unknown>>;
  if (!req) return NextResponse.json({ error: "找不到需求" }, { status: 404 });

  // 明細：每行帶推薦主家 + 該 ingredient 的所有可選 SKU 比價
  const items = await sql`
    SELECT pri.id, pri.ingredient_id, pri.ingredient_name,
           pri.current_stock, pri.needed_qty, pri.unit,
           pri.suggested_item_id, pri.chosen_item_id, pri.notes, pri.sort_order,
           ing.category as ingredient_category,
           ing.unit as ingredient_unit
    FROM purchase_request_items pri
    LEFT JOIN ingredients ing ON pri.ingredient_id = ing.id
    WHERE pri.request_id = ${reqId}
    ORDER BY pri.sort_order, pri.id
  `;

  // 對每行 ingredient，拿可選 SKU 比價（active 的所有 SKU）
  const ingredientIds = items.map((i) => i.ingredient_id).filter((x): x is number => x != null);
  const skuOptions = ingredientIds.length
    ? await sql`
        SELECT i.id, i.name, i.ingredient_id, i.cost_price, i.unit, i.pack_size,
               i.is_primary, i.current_stock,
               s.id as supplier_id, s.name as supplier_name
        FROM items i
        JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.ingredient_id = ANY(${ingredientIds}) AND i.is_active = true
        ORDER BY i.ingredient_id, i.is_primary DESC, i.cost_price ASC
      `
    : [];

  // 按 ingredient_id 分組 SKU
  type SkuOption = (typeof skuOptions)[number];
  const skuMap: Record<number, SkuOption[]> = {};
  for (const s of skuOptions) {
    const ingId = s.ingredient_id as number;
    if (!skuMap[ingId]) skuMap[ingId] = [];
    skuMap[ingId].push(s);
  }

  const enrichedItems = items.map((it) => {
    const skus = skuMap[it.ingredient_id as number] ?? [];
    return {
      ...it,
      currentStock: it.current_stock != null ? Number(it.current_stock) : null,
      neededQty: Number(it.needed_qty ?? 0),
      skuOptions: skus.map((s) => ({
        id: s.id,
        name: s.name,
        supplierId: s.supplier_id,
        supplierName: s.supplier_name,
        costPrice: Number(s.cost_price),
        unit: s.unit,
        packSize: s.pack_size,
        isPrimary: s.is_primary,
        currentStock: Number(s.current_stock),
      })),
    };
  });

  return NextResponse.json({ request: req, items: enrichedItems });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const reqId = parseIntSafe(id);
  if (reqId === null) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  const body = await request.json();
  const { status, items, notes } = body as {
    status?: string;
    items?: Array<{ id: number; chosenItemId?: number | null; neededQty?: number }>;
    notes?: string | null;
  };

  // 驗證需求存在 + 狀態合法
  const [existing] = (await sql`SELECT status FROM purchase_requests WHERE id = ${reqId}`) as unknown as Array<{ status: string }>;
  if (!existing) return NextResponse.json({ error: "找不到需求" }, { status: 404 });
  if (existing.status === "processed" && status !== "processed") {
    return NextResponse.json({ error: "已拆單的需求不能修改" }, { status: 400 });
  }

  try {
    await sql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof sql;

      // 改主表
      if (status || notes !== undefined) {
        await tx`
          UPDATE purchase_requests SET
            status = COALESCE(${status ?? null}, status),
            notes = ${notes ?? null},
            updated_at = NOW()
          WHERE id = ${reqId}
        `;
      }

      // 改明細（老闆切廠商 / 調整需求量）
      if (Array.isArray(items)) {
        for (const it of items) {
          if (!it.id) continue;
          await tx`
            UPDATE purchase_request_items SET
              chosen_item_id = COALESCE(${it.chosenItemId ?? null}, chosen_item_id),
              needed_qty = COALESCE(${it.neededQty ?? null}, needed_qty)
            WHERE id = ${it.id} AND request_id = ${reqId}
          `;
        }
      }
    });

    return NextResponse.json({ message: "已更新" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "更新失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const reqId = parseIntSafe(id);
  if (reqId === null) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  const [existing] = (await sql`SELECT status FROM purchase_requests WHERE id = ${reqId}`) as unknown as Array<{ status: string }>;
  if (!existing) return NextResponse.json({ error: "找不到需求" }, { status: 404 });
  if (existing.status === "processed") {
    return NextResponse.json(
      { error: "已拆單的需求不能刪除（請改取消狀態）" },
      { status: 400 }
    );
  }

  await sql`DELETE FROM purchase_requests WHERE id = ${reqId}`;
  return NextResponse.json({ message: "已刪除" });
}
