/**
 * 自動叫貨建議 API
 * GET /api/reorder-suggestions?store_id=1
 *
 * 邏輯：
 * 1. 庫存 < 安全庫存 → 需要補貨
 * 2. 建議量 = 安全庫存 × 2 - 目前庫存（補到兩倍安全量）
 * 3. 按供應商分組，方便直接產生 PO
 */
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { authenticateRequest } from "@/lib/api-auth";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store_id");

  let rows;
  if (storeId) {
    // 指定門市的庫存
    rows = await sql`
      SELECT i.id as item_id, i.name, i.category, i.unit,
             i.safety_stock, i.cost_price,
             COALESCE(si.current_stock, 0) as current_stock,
             s.id as supplier_id, s.name as supplier_name
      FROM items i
      JOIN suppliers s ON i.supplier_id = s.id
      LEFT JOIN store_inventory si ON si.item_id = i.id AND si.store_id = ${parseInt(storeId)}
      WHERE i.is_active = true
        AND i.safety_stock::numeric > 0
        AND COALESCE(si.current_stock, 0)::numeric < i.safety_stock::numeric
      ORDER BY s.name, i.category, i.name
    `;
  } else {
    // 全部彙總
    rows = await sql`
      SELECT i.id as item_id, i.name, i.category, i.unit,
             i.safety_stock, i.cost_price,
             COALESCE(i.current_stock, 0) as current_stock,
             s.id as supplier_id, s.name as supplier_name
      FROM items i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.is_active = true
        AND i.safety_stock::numeric > 0
        AND COALESCE(i.current_stock, 0)::numeric < i.safety_stock::numeric
      ORDER BY s.name, i.category, i.name
    `;
  }

  // 計算建議量 + 按供應商分組
  const supplierMap = new Map<number, {
    supplierId: number;
    supplierName: string;
    items: Array<{
      itemId: number;
      name: string;
      category: string;
      unit: string;
      currentStock: number;
      safetyStock: number;
      suggestedQty: number;
      estimatedCost: number;
    }>;
    totalCost: number;
  }>();

  for (const r of rows) {
    const current = parseFloat(r.current_stock as string) || 0;
    const safety = parseFloat(r.safety_stock as string) || 0;
    const suggested = Math.max(0, Math.ceil((safety * 2 - current) * 10) / 10);
    const cost = suggested * (r.cost_price as number || 0);

    const sid = r.supplier_id as number;
    if (!supplierMap.has(sid)) {
      supplierMap.set(sid, {
        supplierId: sid,
        supplierName: r.supplier_name as string,
        items: [],
        totalCost: 0,
      });
    }
    const group = supplierMap.get(sid)!;
    group.items.push({
      itemId: r.item_id as number,
      name: r.name as string,
      category: r.category as string,
      unit: r.unit as string,
      currentStock: current,
      safetyStock: safety,
      suggestedQty: suggested,
      estimatedCost: Math.round(cost),
    });
    group.totalCost += Math.round(cost);
  }

  const suppliers = Array.from(supplierMap.values());

  return NextResponse.json({
    storeId: storeId ? parseInt(storeId) : null,
    suppliers,
    summary: {
      totalSuppliers: suppliers.length,
      totalItems: rows.length,
      totalEstimatedCost: suppliers.reduce((s, g) => s + g.totalCost, 0),
    },
  });
}
