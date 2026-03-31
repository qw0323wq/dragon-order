/**
 * 消耗報表 API
 * GET /api/reports/consumption?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=1
 *
 * 計算：POS 銷量 × BOM 配方 → 理論食材消耗
 * 對比：實際庫存異動（出貨量）
 * 產出：損耗率 = (實際消耗 - 理論消耗) / 理論消耗
 */
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { authenticateRequest } from "@/lib/api-auth";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const storeId = searchParams.get("store_id");

  // 1. 理論消耗：訂單銷量 × BOM 用量
  // order_items 記錄了各店各品項的叫貨量
  // bom_items 記錄了菜品→原料的配方
  const theoreticalRows = await sql`
    SELECT
      bi.item_id,
      i.name as item_name,
      i.unit,
      i.category,
      SUM(oi.quantity * COALESCE(
        NULLIF(regexp_replace(bi.quantity, '[^0-9.]', '', 'g'), '')::numeric,
        0
      )) as theoretical_qty
    FROM order_items oi
    JOIN menu_items mi ON mi.name = (SELECT name FROM items WHERE id = oi.item_id)
    JOIN bom_items bi ON bi.menu_item_id = mi.id
    JOIN items i ON i.id = bi.item_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ${from}::date
      AND o.created_at < (${to}::date + interval '1 day')
      ${storeId ? sql`AND oi.store_id = ${parseInt(storeId)}` : sql``}
    GROUP BY bi.item_id, i.name, i.unit, i.category
    ORDER BY i.category, i.name
  `;

  // 2. 實際消耗：inventory_logs 中 type='out' 的總量
  const actualRows = await sql`
    SELECT
      item_id,
      ABS(SUM(quantity::numeric)) as actual_qty
    FROM inventory_logs
    WHERE type = 'out'
      AND created_at >= ${from}::date
      AND created_at < (${to}::date + interval '1 day')
      ${storeId ? sql`AND store_id = ${parseInt(storeId)}` : sql``}
      AND source NOT LIKE '%撥貨%'
      AND source NOT LIKE '%歸還%'
    GROUP BY item_id
  `;

  const actualMap = new Map<number, number>();
  for (const r of actualRows) {
    actualMap.set(r.item_id as number, parseFloat(r.actual_qty as string) || 0);
  }

  // 3. 合併計算損耗率
  const result = theoreticalRows.map((r) => {
    const theoretical = parseFloat(r.theoretical_qty as string) || 0;
    const actual = actualMap.get(r.item_id as number) || 0;
    const diff = actual - theoretical;
    const wasteRate = theoretical > 0 ? diff / theoretical : 0;

    return {
      itemId: r.item_id,
      itemName: r.item_name,
      category: r.category,
      unit: r.unit,
      theoreticalQty: Math.round(theoretical * 100) / 100,
      actualQty: Math.round(actual * 100) / 100,
      diff: Math.round(diff * 100) / 100,
      wasteRate: Math.round(wasteRate * 1000) / 10, // 百分比
    };
  });

  // 4. 也列出有實際消耗但沒有 BOM 對應的品項
  const bomItemIds = new Set(theoreticalRows.map((r) => r.item_id as number));
  const unmatchedActual = [];
  for (const [itemId, qty] of actualMap) {
    if (!bomItemIds.has(itemId) && qty > 0) {
      const [item] = await sql`SELECT name, unit, category FROM items WHERE id = ${itemId}`;
      if (item) {
        unmatchedActual.push({
          itemId,
          itemName: item.name,
          category: item.category,
          unit: item.unit,
          theoreticalQty: 0,
          actualQty: Math.round(qty * 100) / 100,
          diff: Math.round(qty * 100) / 100,
          wasteRate: null, // 無法計算
        });
      }
    }
  }

  return NextResponse.json({
    period: { from, to },
    storeId: storeId ? parseInt(storeId) : null,
    items: [...result, ...unmatchedActual],
    summary: {
      totalItems: result.length + unmatchedActual.length,
      avgWasteRate: result.length > 0
        ? Math.round(result.reduce((s, r) => s + (r.wasteRate || 0), 0) / result.length * 10) / 10
        : 0,
      highWaste: result.filter((r) => r.wasteRate > 10).length,
    },
  });
}
