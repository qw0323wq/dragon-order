/**
 * 單一食材 API
 *
 * GET    /api/ingredients/[id] — 食材詳情（含所有 SKU 比價 + 用在哪些菜）
 * PUT    /api/ingredients/[id] — 編輯 name/category/unit/notes
 * DELETE /api/ingredients/[id] — 刪除（軟刪除？這裡先硬刪，items 會自動 SET NULL）
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const ingId = parseIntSafe(id);
  if (ingId === null) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  const [ingredient] = await sql`SELECT * FROM ingredients WHERE id = ${ingId}`;
  if (!ingredient) {
    return NextResponse.json({ error: "找不到食材" }, { status: 404 });
  }

  // 所有對應的 SKU（含庫存彙總）
  const skus = await sql`
    SELECT i.id, i.name, i.sku, i.is_active, i.is_primary,
           i.cost_price, i.store_price, i.unit, i.pack_size,
           COALESCE(SUM(si.current_stock::numeric), 0) as total_stock,
           s.id as supplier_id, s.name as supplier_name
    FROM items i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN store_inventory si ON si.item_id = i.id
    WHERE i.ingredient_id = ${ingId}
    GROUP BY i.id, s.id, s.name
    ORDER BY i.is_primary DESC, i.cost_price ASC
  `;

  // 用在哪些菜
  const menuItems = await sql`
    SELECT DISTINCT mi.id, mi.name, mi.category, mi.sell_price, bi.quantity
    FROM bom_items bi
    JOIN menu_items mi ON bi.menu_item_id = mi.id
    WHERE bi.ingredient_id = ${ingId}
    ORDER BY mi.category, mi.name
  `;

  // 計算最便宜 + 平均成本
  const activeSkus = skus.filter((s) => s.is_active);
  const costs = activeSkus.map((s) => Number(s.cost_price)).filter((c) => c > 0);
  const minCost = costs.length ? Math.min(...costs) : null;
  const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;

  // 總庫存（彙總所有 SKU 的 store_inventory）
  const totalStock = skus.reduce((sum, s) => sum + Number(s.total_stock ?? 0), 0);

  // 最近 7 天消耗（從 inventory_logs 看 out 紀錄）
  const itemIds = skus.map((s) => Number(s.id));
  let last7DaysOutflow = 0;
  if (itemIds.length > 0) {
    const [outRow] = (await sql`
      SELECT COALESCE(SUM(ABS(quantity::numeric)), 0) as out_sum
      FROM inventory_logs
      WHERE item_id = ANY(${itemIds})
        AND type = 'out'
        AND created_at >= NOW() - INTERVAL '7 days'
    `) as unknown as Array<{ out_sum: string }>;
    last7DaysOutflow = Number(outRow?.out_sum ?? 0);
  }

  return NextResponse.json({
    ingredient,
    skus: skus.map((s) => ({
      ...s,
      cost_price: Number(s.cost_price),
      store_price: Number(s.store_price),
      total_stock: Number(s.total_stock),
      isCheapest: minCost != null && Number(s.cost_price) === minCost && s.is_active,
    })),
    menuItems,
    summary: {
      skuCount: activeSkus.length,
      menuCount: menuItems.length,
      minCost,
      avgCost,
      totalStock,
      last7DaysOutflow,
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "僅管理員可編輯食材" }, { status: 403 });
  }

  const { id } = await params;
  const ingId = parseIntSafe(id);
  if (ingId === null) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  const body = await request.json();
  const { name, category, unit, notes } = body;

  await sql`
    UPDATE ingredients SET
      name = COALESCE(${name ?? null}, name),
      category = COALESCE(${category ?? null}, category),
      unit = COALESCE(${unit ?? null}, unit),
      notes = ${notes ?? null},
      updated_at = NOW()
    WHERE id = ${ingId}
  `;

  return NextResponse.json({ message: "已更新" });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "僅管理員可刪除食材" }, { status: 403 });
  }

  const { id } = await params;
  const ingId = parseIntSafe(id);
  if (ingId === null) return NextResponse.json({ error: "無效的 ID" }, { status: 400 });

  // 檢查是否還有 BOM 用到
  const [{ count }] = (await sql`
    SELECT COUNT(*)::int as count FROM bom_items WHERE ingredient_id = ${ingId}
  `) as unknown as Array<{ count: number }>;
  if (count > 0) {
    return NextResponse.json(
      { error: `仍有 ${count} 筆 BOM 使用此食材，請先移除後再刪除` },
      { status: 409 }
    );
  }

  await sql`DELETE FROM ingredients WHERE id = ${ingId}`;
  return NextResponse.json({ message: "已刪除" });
}
