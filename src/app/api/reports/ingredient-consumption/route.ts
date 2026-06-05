/**
 * GET /api/reports/ingredient-consumption?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=N
 *
 * Ingredient 維度的消耗報表 — 把同食材跨多家供應商的消耗加總
 *
 * 來源：inventory_logs (type='out')
 *   過往按 item 聚合，現在按 ingredient_id 聚合
 *
 * 回傳：每個 ingredient 在區間內的：
 *   - totalOut: 累積出庫量（across all SKU）
 *   - bySupplier: breakdown 看哪家扣得多
 */
import { NextRequest, NextResponse } from "next/server";
import { formatDateLocal } from "@/lib/format";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || formatDateLocal(new Date(Date.now() - 30 * 86400000));
  const to = searchParams.get("to") || formatDateLocal();
  const storeIdRaw = searchParams.get("store_id");
  const storeId = storeIdRaw ? parseIntSafe(storeIdRaw) : null;
  if (storeIdRaw && storeId === null) {
    return NextResponse.json({ error: "無效的 store_id" }, { status: 400 });
  }

  const storeFilter = storeId !== null ? sql`AND il.store_id = ${storeId}` : sql``;

  const rows = await sql`
    SELECT
      ing.id, ing.name, ing.category, ing.unit,
      COALESCE(SUM(ABS(il.quantity::numeric)), 0) as total_out,
      COUNT(DISTINCT il.item_id)::int as sku_count_used
    FROM inventory_logs il
    JOIN items i ON il.item_id = i.id
    JOIN ingredients ing ON i.ingredient_id = ing.id
    WHERE il.type = 'out'
      AND il.created_at >= ${from}::date
      AND il.created_at < (${to}::date + INTERVAL '1 day')
      ${storeFilter}
    GROUP BY ing.id, ing.name, ing.category, ing.unit
    ORDER BY total_out DESC
  `;

  return NextResponse.json({
    from,
    to,
    storeId,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      unit: r.unit,
      totalOut: Number(r.total_out ?? 0),
      skuCountUsed: Number(r.sku_count_used ?? 0),
    })),
  });
}
