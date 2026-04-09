/**
 * 調撥對帳 API
 * GET /api/reports/transfer-settlement?month=2026-03
 *
 * 月底結算各門市間的互借食材金額
 * 計算：借出量 × 進貨價 = 應收金額
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";


export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || new Date().toISOString().slice(0, 7); // YYYY-MM
  const startDate = `${month}-01`;
  const endDate = `${month}-31`; // PostgreSQL 會自動處理月底

  // 所有該月的調撥/借料明細
  const rows = await sql`
    SELECT
      t.id as transfer_id,
      t.transfer_number,
      t.type,
      t.status,
      t.from_store_id,
      fs.name as from_store_name,
      t.to_store_id,
      ts.name as to_store_name,
      t.created_at,
      ti.item_id,
      i.name as item_name,
      i.unit,
      i.cost_price,
      ti.quantity::numeric as quantity,
      ti.returned_qty::numeric as returned_qty
    FROM transfers t
    JOIN stores fs ON t.from_store_id = fs.id
    JOIN stores ts ON t.to_store_id = ts.id
    JOIN transfer_items ti ON ti.transfer_id = t.id
    JOIN items i ON ti.item_id = i.id
    WHERE t.created_at >= ${startDate}::date
      AND t.created_at < (${endDate}::date + interval '1 day')
    ORDER BY t.from_store_id, t.to_store_id, t.created_at
  `;

  // 按「門市對」彙總
  type PairKey = string;
  const pairMap = new Map<PairKey, {
    fromStoreId: number; fromStoreName: string
    toStoreId: number; toStoreName: string
    items: Array<{
      transferNumber: string; type: string; status: string
      itemName: string; unit: string; costPrice: number
      quantity: number; returnedQty: number; netQty: number; amount: number
    }>
    totalAmount: number
    totalReturned: number
  }>();

  for (const r of rows) {
    const key: PairKey = `${r.from_store_id}-${r.to_store_id}`;
    if (!pairMap.has(key)) {
      pairMap.set(key, {
        fromStoreId: r.from_store_id as number,
        fromStoreName: r.from_store_name as string,
        toStoreId: r.to_store_id as number,
        toStoreName: r.to_store_name as string,
        items: [],
        totalAmount: 0,
        totalReturned: 0,
      });
    }

    const qty = parseFloat(r.quantity as string) || 0;
    const retQty = parseFloat(r.returned_qty as string) || 0;
    const netQty = qty - retQty;
    const costPrice = r.cost_price as number || 0;
    const amount = Math.round(netQty * costPrice);

    const pair = pairMap.get(key)!;
    pair.items.push({
      transferNumber: r.transfer_number as string,
      type: r.type as string,
      status: r.status as string,
      itemName: r.item_name as string,
      unit: r.unit as string,
      costPrice,
      quantity: qty,
      returnedQty: retQty,
      netQty,
      amount,
    });
    pair.totalAmount += amount;
    pair.totalReturned += Math.round(retQty * costPrice);
  }

  // 計算淨結算（A→B 的金額 - B→A 的金額）
  const pairs = Array.from(pairMap.values());

  // 門市間淨額
  const netSettlement = new Map<string, { store1: string; store2: string; net: number; direction: string }>();
  for (const pair of pairs) {
    const reverseKey = `${pair.toStoreId}-${pair.fromStoreId}`;
    const forwardKey = `${pair.fromStoreId}-${pair.toStoreId}`;
    const sortedKey = pair.fromStoreId < pair.toStoreId ? forwardKey : reverseKey;

    if (!netSettlement.has(sortedKey)) {
      const s1 = pair.fromStoreId < pair.toStoreId ? pair.fromStoreName : pair.toStoreName;
      const s2 = pair.fromStoreId < pair.toStoreId ? pair.toStoreName : pair.fromStoreName;
      netSettlement.set(sortedKey, { store1: s1, store2: s2, net: 0, direction: '' });
    }

    const entry = netSettlement.get(sortedKey)!;
    if (pair.fromStoreId < pair.toStoreId) {
      entry.net += pair.totalAmount; // store1 → store2，store2 欠 store1
    } else {
      entry.net -= pair.totalAmount; // store2 → store1，store1 欠 store2
    }
  }

  // 設定方向描述
  for (const entry of netSettlement.values()) {
    if (entry.net > 0) {
      entry.direction = `${entry.store2} 應付 ${entry.store1}`;
    } else if (entry.net < 0) {
      entry.direction = `${entry.store1} 應付 ${entry.store2}`;
      entry.net = Math.abs(entry.net);
    } else {
      entry.direction = '互不相欠';
    }
  }

  return NextResponse.json({
    month,
    pairs,
    settlement: Array.from(netSettlement.values()),
    summary: {
      totalTransfers: rows.length,
      totalAmount: pairs.reduce((s, p) => s + p.totalAmount, 0),
    },
  });
}
