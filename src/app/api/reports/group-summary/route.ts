/**
 * 集團報表 API
 * GET /api/reports/group-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 各店採購金額比較、品項用量排名、成本佔比
 */
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { authenticateRequest } from "@/lib/api-auth";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);

  // 1. 各店採購金額
  const storeSpending = await sql`
    SELECT
      s.id as store_id, s.name as store_name,
      COUNT(DISTINCT o.id) as order_count,
      COALESCE(SUM(oi.subtotal), 0)::int as total_amount,
      COUNT(DISTINCT oi.item_id) as unique_items
    FROM stores s
    LEFT JOIN order_items oi ON oi.store_id = s.id
    LEFT JOIN orders o ON o.id = oi.order_id
      AND o.created_at >= ${from}::date
      AND o.created_at < (${to}::date + interval '1 day')
    GROUP BY s.id, s.name
    ORDER BY total_amount DESC
  `;

  // 2. 品項用量排名 TOP 20（全店合計）
  const topItems = await sql`
    SELECT
      i.id as item_id, i.name, i.category, i.unit,
      sup.name as supplier_name,
      SUM(oi.quantity) as total_qty,
      SUM(oi.subtotal)::int as total_amount
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN suppliers sup ON i.supplier_id = sup.id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ${from}::date
      AND o.created_at < (${to}::date + interval '1 day')
    GROUP BY i.id, i.name, i.category, i.unit, sup.name
    ORDER BY total_amount DESC
    LIMIT 20
  `;

  // 3. 分類成本佔比
  const categoryCost = await sql`
    SELECT
      i.category,
      SUM(oi.subtotal)::int as total_amount,
      COUNT(DISTINCT oi.item_id) as item_count
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ${from}::date
      AND o.created_at < (${to}::date + interval '1 day')
    GROUP BY i.category
    ORDER BY total_amount DESC
  `;

  // 4. 供應商採購金額排名
  const supplierSpending = await sql`
    SELECT
      sup.id as supplier_id, sup.name, sup.category as supplier_category,
      SUM(oi.subtotal)::int as total_amount,
      COUNT(DISTINCT oi.item_id) as item_count,
      COUNT(DISTINCT o.id) as order_count
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN suppliers sup ON i.supplier_id = sup.id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ${from}::date
      AND o.created_at < (${to}::date + interval '1 day')
    GROUP BY sup.id, sup.name, sup.category
    ORDER BY total_amount DESC
    LIMIT 15
  `;

  // 5. 各店品項用量比較（同品項不同店的用量）
  const storeItemComparison = await sql`
    SELECT
      i.id as item_id, i.name, i.category,
      s.id as store_id, s.name as store_name,
      SUM(oi.quantity) as total_qty,
      SUM(oi.subtotal)::int as total_amount
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN stores s ON oi.store_id = s.id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ${from}::date
      AND o.created_at < (${to}::date + interval '1 day')
    GROUP BY i.id, i.name, i.category, s.id, s.name
    ORDER BY total_amount DESC
    LIMIT 50
  `;

  const grandTotal = storeSpending.reduce((s, r) => s + (r.total_amount as number), 0);

  return NextResponse.json({
    period: { from, to },
    storeSpending: storeSpending.map(r => ({
      ...r,
      percentage: grandTotal > 0 ? Math.round((r.total_amount as number) / grandTotal * 1000) / 10 : 0,
    })),
    topItems: topItems.map(r => ({
      ...r,
      total_qty: parseFloat(r.total_qty as string) || 0,
    })),
    categoryCost: categoryCost.map(r => ({
      ...r,
      percentage: grandTotal > 0 ? Math.round((r.total_amount as number) / grandTotal * 1000) / 10 : 0,
    })),
    supplierSpending,
    storeItemComparison: storeItemComparison.map(r => ({
      ...r,
      total_qty: parseFloat(r.total_qty as string) || 0,
    })),
    summary: {
      grandTotal,
      storeCount: storeSpending.length,
      totalOrders: storeSpending.reduce((s, r) => s + (r.order_count as number), 0),
    },
  });
}
