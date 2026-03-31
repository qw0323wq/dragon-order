/**
 * 叫貨單歷史比較 API
 * GET /api/reports/order-comparison?period1_from=...&period1_to=...&period2_from=...&period2_to=...
 *
 * 比較兩個時段的叫貨量，找出異常（大幅增減）
 * 預設：上週 vs 這週
 */
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { authenticateRequest } from "@/lib/api-auth";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const now = new Date();

  // 預設：這週一 ~ 今天 vs 上週一 ~ 上週日
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - now.getDay() + 1);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(lastSunday.getDate() - 1);

  const p1From = searchParams.get("period1_from") || lastMonday.toISOString().slice(0, 10);
  const p1To = searchParams.get("period1_to") || lastSunday.toISOString().slice(0, 10);
  const p2From = searchParams.get("period2_from") || thisMonday.toISOString().slice(0, 10);
  const p2To = searchParams.get("period2_to") || now.toISOString().slice(0, 10);

  // 各時段的叫貨量
  const period1 = await sql`
    SELECT oi.item_id, i.name, i.category, i.unit, s.name as supplier_name,
           SUM(oi.quantity) as total_qty
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN suppliers s ON i.supplier_id = s.id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ${p1From}::date AND o.created_at < (${p1To}::date + interval '1 day')
    GROUP BY oi.item_id, i.name, i.category, i.unit, s.name
  `;

  const period2 = await sql`
    SELECT oi.item_id, i.name, i.category, i.unit, s.name as supplier_name,
           SUM(oi.quantity) as total_qty
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN suppliers s ON i.supplier_id = s.id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.created_at >= ${p2From}::date AND o.created_at < (${p2To}::date + interval '1 day')
    GROUP BY oi.item_id, i.name, i.category, i.unit, s.name
  `;

  // 合併比較
  const p1Map = new Map<number, { name: string; category: string; unit: string; supplier: string; qty: number }>();
  for (const r of period1) {
    p1Map.set(r.item_id as number, {
      name: r.name as string,
      category: r.category as string,
      unit: r.unit as string,
      supplier: r.supplier_name as string,
      qty: parseFloat(r.total_qty as string) || 0,
    });
  }

  const p2Map = new Map<number, { name: string; category: string; unit: string; supplier: string; qty: number }>();
  for (const r of period2) {
    p2Map.set(r.item_id as number, {
      name: r.name as string,
      category: r.category as string,
      unit: r.unit as string,
      supplier: r.supplier_name as string,
      qty: parseFloat(r.total_qty as string) || 0,
    });
  }

  const allIds = new Set([...p1Map.keys(), ...p2Map.keys()]);
  const items = [];

  for (const id of allIds) {
    const p1 = p1Map.get(id);
    const p2 = p2Map.get(id);
    const qty1 = p1?.qty || 0;
    const qty2 = p2?.qty || 0;
    const diff = qty2 - qty1;
    const changeRate = qty1 > 0 ? Math.round((diff / qty1) * 1000) / 10 : qty2 > 0 ? 100 : 0;

    items.push({
      itemId: id,
      name: (p2 || p1)!.name,
      category: (p2 || p1)!.category,
      unit: (p2 || p1)!.unit,
      supplier: (p2 || p1)!.supplier,
      period1Qty: qty1,
      period2Qty: qty2,
      diff,
      changeRate, // 百分比
      isAnomaly: Math.abs(changeRate) >= 50 && Math.abs(diff) >= 1, // 變動>50%且差異>1
    });
  }

  // 按異常程度排序
  items.sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate));

  return NextResponse.json({
    period1: { from: p1From, to: p1To },
    period2: { from: p2From, to: p2To },
    items,
    summary: {
      totalItems: items.length,
      anomalies: items.filter((i) => i.isAnomaly).length,
      increased: items.filter((i) => i.diff > 0).length,
      decreased: items.filter((i) => i.diff < 0).length,
      newItems: items.filter((i) => i.period1Qty === 0 && i.period2Qty > 0).length,
      droppedItems: items.filter((i) => i.period1Qty > 0 && i.period2Qty === 0).length,
    },
  });
}
