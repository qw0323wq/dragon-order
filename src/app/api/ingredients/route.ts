/**
 * 食材主檔 API
 *
 * GET    /api/ingredients — 列出所有 ingredient + 對應供應商統計
 * POST   /api/ingredients — 新增 ingredient（罕用，通常 seed 建好）
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  // 每個 ingredient + 對應供應商統計（家數 + 最低價 + 主供應商）
  // 加 menu_use_count: 用在幾道菜（雙向關聯）
  const rows = await sql`
    SELECT
      ing.id, ing.name, ing.category, ing.unit, ing.notes,
      COALESCE(stats.supplier_count, 0)::int as supplier_count,
      stats.min_cost,
      stats.primary_item_id,
      stats.primary_item_name,
      stats.primary_supplier_name,
      stats.primary_cost,
      COALESCE(use_stats.menu_use_count, 0)::int as menu_use_count
    FROM ingredients ing
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int as supplier_count,
        MIN(i.cost_price) as min_cost,
        (SELECT i2.id FROM items i2 WHERE i2.ingredient_id = ing.id AND i2.is_primary = true AND i2.is_active = true LIMIT 1) as primary_item_id,
        (SELECT i2.name FROM items i2 WHERE i2.ingredient_id = ing.id AND i2.is_primary = true AND i2.is_active = true LIMIT 1) as primary_item_name,
        (SELECT s.name FROM items i2 JOIN suppliers s ON i2.supplier_id = s.id WHERE i2.ingredient_id = ing.id AND i2.is_primary = true AND i2.is_active = true LIMIT 1) as primary_supplier_name,
        (SELECT i2.cost_price FROM items i2 WHERE i2.ingredient_id = ing.id AND i2.is_primary = true AND i2.is_active = true LIMIT 1) as primary_cost
      FROM items i
      WHERE i.ingredient_id = ing.id AND i.is_active = true
    ) stats ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(DISTINCT menu_item_id)::int as menu_use_count
      FROM bom_items
      WHERE ingredient_id = ing.id
    ) use_stats ON true
    ORDER BY ing.category, ing.name
  `;

  // 轉 camelCase + 數字
  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    notes: r.notes,
    supplierCount: Number(r.supplier_count ?? 0),
    minCost: r.min_cost != null ? Number(r.min_cost) : null,
    primaryItemId: r.primary_item_id ?? null,
    primaryItemName: r.primary_item_name ?? null,
    primarySupplierName: r.primary_supplier_name ?? null,
    primaryCost: r.primary_cost != null ? Number(r.primary_cost) : null,
    menuUseCount: Number(r.menu_use_count ?? 0),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "僅管理員可新增食材" }, { status: 403 });
  }

  const body = await request.json();
  const { name, category, unit, notes } = body;
  if (!name || !unit) {
    return NextResponse.json({ error: "name 與 unit 為必填" }, { status: 400 });
  }

  const [created] = await sql`
    INSERT INTO ingredients (name, category, unit, notes)
    VALUES (${name.trim()}, ${category ?? null}, ${unit}, ${notes ?? null})
    ON CONFLICT (name) DO NOTHING
    RETURNING id, name, category, unit
  `;
  if (!created) {
    return NextResponse.json({ error: "已存在同名食材" }, { status: 409 });
  }
  return NextResponse.json(created, { status: 201 });
}
