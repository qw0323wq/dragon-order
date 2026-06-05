/**
 * GET /api/inventory/by-ingredient — ingredient 維度的庫存彙總
 *
 * Query：
 *   ?store=hq | <store_id>  (預設彙總全部)
 *   ?category=肉品
 *   ?q=貢丸               (ingredient 名稱模糊搜尋)
 *   ?low=1                (只看不足安全庫存)
 *
 * 回傳：每個 ingredient 對應的所有 SKU 庫存 SUM
 *   ingredient → totalStock + breakdown by item/store
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const storeParam = searchParams.get("store");
  const q = searchParams.get("q")?.trim();
  const lowOnly = searchParams.get("low") === "1";

  // 解析 store 篩選
  let storeFilter = sql``;
  if (storeParam === "hq") {
    storeFilter = sql`AND si.store_id IS NULL`;
  } else if (storeParam) {
    const sid = parseIntSafe(storeParam);
    if (sid === null) {
      return NextResponse.json({ error: "無效的 store id" }, { status: 400 });
    }
    storeFilter = sql`AND si.store_id = ${sid}`;
  }

  // 每個 ingredient 的總庫存（按 ingredient_id 聚合）
  // 同時帶回主供應商 + 該 ingredient 的供應商家數
  const rows = await sql`
    SELECT
      ing.id, ing.name, ing.category, ing.unit,
      COALESCE(SUM(si.current_stock::numeric), 0) AS total_stock,
      COUNT(DISTINCT i.id)::int AS sku_count,
      MAX(CASE WHEN i.is_primary THEN i.id END) AS primary_item_id,
      MAX(CASE WHEN i.is_primary THEN i.name END) AS primary_item_name,
      MAX(CASE WHEN i.is_primary THEN i.cost_price END) AS primary_cost,
      MAX(i.safety_stock::numeric) AS safety_stock
    FROM ingredients ing
    LEFT JOIN items i ON i.ingredient_id = ing.id AND i.is_active = true
    LEFT JOIN store_inventory si ON si.item_id = i.id ${storeFilter}
    WHERE 1=1
      ${category ? sql`AND ing.category = ${category}` : sql``}
      ${q ? sql`AND ing.name ILIKE ${'%' + q + '%'}` : sql``}
    GROUP BY ing.id, ing.name, ing.category, ing.unit
    ${lowOnly
      ? sql`HAVING COALESCE(SUM(si.current_stock::numeric), 0) < MAX(COALESCE(i.safety_stock::numeric, 0))`
      : sql``}
    ORDER BY ing.category, ing.name
  `;

  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    totalStock: Number(r.total_stock ?? 0),
    skuCount: Number(r.sku_count ?? 0),
    primaryItemId: r.primary_item_id ?? null,
    primaryItemName: r.primary_item_name ?? null,
    primaryCost: r.primary_cost != null ? Number(r.primary_cost) : null,
    safetyStock: r.safety_stock != null ? Number(r.safety_stock) : 0,
    /** totalStock < safetyStock 的提醒 */
    isLow:
      r.safety_stock != null && Number(r.total_stock ?? 0) < Number(r.safety_stock),
  }));

  return NextResponse.json(result);
}
