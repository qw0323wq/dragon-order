/**
 * GET /api/ingredients/suggestions?storeId=N&onlyLow=1
 *
 * 補貨建議 — 對每個 ingredient 算現況跟建議叫貨量
 *
 * 邏輯：
 *   - totalStock：所有 SKU 在指定 store 的庫存 SUM
 *   - safetyStock：取該 ingredient 所有 SKU 的 MAX safetyStock
 *   - last7DaysOutflow：最近 7 天從 inventory_logs 的 out 量
 *   - suggestedQty：safetyStock - totalStock 若 < 0 取 0；如果安全庫存沒設，用 last7DaysOutflow / 7 × 預設訂貨週期（3 天）做粗估
 *   - isLow：totalStock < safetyStock
 *
 * Query：
 *   storeId   篩選某門市庫存（不填 = 全部）
 *   onlyLow=1 只回低於安全庫存的
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

const DEFAULT_REORDER_WINDOW_DAYS = 3;

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const storeIdRaw = searchParams.get("storeId");
  const storeId = storeIdRaw ? parseIntSafe(storeIdRaw) : null;
  if (storeIdRaw && storeId === null) {
    return NextResponse.json({ error: "無效的 storeId" }, { status: 400 });
  }
  const onlyLow = searchParams.get("onlyLow") === "1";

  const storeFilter = storeId !== null ? sql`AND si.store_id = ${storeId}` : sql``;
  const logStoreFilter = storeId !== null ? sql`AND il.store_id = ${storeId}` : sql``;

  const rows = await sql`
    SELECT
      ing.id, ing.name, ing.category, ing.unit,
      COALESCE(SUM(si.current_stock::numeric), 0) AS total_stock,
      MAX(i.safety_stock::numeric) AS safety_stock,
      MAX(CASE WHEN i.is_primary THEN i.id END) AS primary_item_id,
      MAX(CASE WHEN i.is_primary THEN i.cost_price END) AS primary_cost,
      MAX(CASE WHEN i.is_primary THEN s.name END) AS primary_supplier_name,
      (
        SELECT COALESCE(SUM(ABS(il.quantity::numeric)), 0)
        FROM inventory_logs il
        JOIN items i2 ON il.item_id = i2.id
        WHERE i2.ingredient_id = ing.id
          AND il.type = 'out'
          AND il.created_at >= NOW() - INTERVAL '7 days'
          ${logStoreFilter}
      ) AS last7_outflow
    FROM ingredients ing
    LEFT JOIN items i ON i.ingredient_id = ing.id AND i.is_active = true
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN store_inventory si ON si.item_id = i.id ${storeFilter}
    GROUP BY ing.id, ing.name, ing.category, ing.unit
    ORDER BY ing.category, ing.name
  `;

  const result = rows.map((r) => {
    const totalStock = Number(r.total_stock ?? 0);
    const safetyStock = r.safety_stock != null ? Number(r.safety_stock) : 0;
    const last7Outflow = Number(r.last7_outflow ?? 0);
    const isLow = safetyStock > 0 && totalStock < safetyStock;

    // 建議叫貨量：
    //   1) 如有安全庫存且低於 → 補到「安全庫存 × 1.5」
    //   2) 否則用「最近7天消耗 × 訂貨週期天數 / 7」推估
    let suggestedQty = 0;
    if (safetyStock > 0) {
      suggestedQty = Math.max(0, Math.ceil(safetyStock * 1.5 - totalStock));
    } else if (last7Outflow > 0) {
      suggestedQty = Math.ceil((last7Outflow * DEFAULT_REORDER_WINDOW_DAYS) / 7);
    }

    return {
      id: r.id,
      name: r.name,
      category: r.category,
      unit: r.unit,
      totalStock,
      safetyStock,
      last7DaysOutflow: last7Outflow,
      suggestedQty,
      isLow,
      primaryItemId: r.primary_item_id ?? null,
      primarySupplierName: r.primary_supplier_name ?? null,
      primaryCost: r.primary_cost != null ? Number(r.primary_cost) : null,
    };
  });

  return NextResponse.json(onlyLow ? result.filter((r) => r.isLow) : result);
}
