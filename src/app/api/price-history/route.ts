/**
 * GET  /api/price-history?item_id=xx — 查詢某品項的價格歷史
 * GET  /api/price-history?supplier_id=xx — 查詢某供應商所有品項的價格歷史
 * GET  /api/price-history — 查詢全部價格歷史（最近 100 筆）
 * POST /api/price-history — 批次新增價格歷史紀錄
 */
import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { authenticateRequest, requireAdmin } from '@/lib/api-auth';
import { parseIntSafe } from '@/lib/parse-int-safe';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('item_id');
  const supplierId = searchParams.get('supplier_id');

  let rows;

  if (itemId) {
    const parsedItemId = parseIntSafe(itemId);
    if (parsedItemId === null) {
      return NextResponse.json({ error: '無效的品項 ID' }, { status: 400 });
    }
    // 單品項歷史
    rows = await sql`
      SELECT h.*, i.name as item_name, s.name as supplier_name
      FROM item_price_history h
      JOIN items i ON h.item_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE h.item_id = ${parsedItemId}
      ORDER BY h.effective_date DESC
      LIMIT 100
    `;
  } else if (supplierId) {
    const parsedSupplierId = parseIntSafe(supplierId);
    if (parsedSupplierId === null) {
      return NextResponse.json({ error: '無效的供應商 ID' }, { status: 400 });
    }
    // 某供應商所有品項
    rows = await sql`
      SELECT h.*, i.name as item_name, s.name as supplier_name
      FROM item_price_history h
      JOIN items i ON h.item_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.supplier_id = ${parsedSupplierId}
      ORDER BY h.effective_date DESC, i.name
      LIMIT 200
    `;
  } else {
    // 全部最近紀錄
    rows = await sql`
      SELECT h.*, i.name as item_name, s.name as supplier_name
      FROM item_price_history h
      JOIN items i ON h.item_id = i.id
      JOIN suppliers s ON i.supplier_id = s.id
      ORDER BY h.effective_date DESC, i.name
      LIMIT 100
    `;
  }

  return NextResponse.json(rows);
}

/**
 * POST /api/price-history — 批次新增價格歷史紀錄
 * Body: { records: [{ itemId, oldPrice, newPrice, priceDiff, changePercent, priceUnit, effectiveDate, source }] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { records } = await req.json() as {
    records: {
      itemId: number;
      oldPrice: number;
      newPrice: number;
      priceDiff: number;
      changePercent: string;
      priceUnit: string;
      effectiveDate: string;
      source?: string;
    }[];
  };

  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: '請提供 records 陣列' }, { status: 400 });
  }

  let inserted = 0;
  for (const r of records) {
    await sql`
      INSERT INTO item_price_history (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
      VALUES (${r.itemId}, ${r.oldPrice}, ${r.newPrice}, ${r.priceDiff}, ${r.changePercent}, ${r.priceUnit}, ${r.effectiveDate}, ${r.source || null})
    `;
    inserted++;
  }

  return NextResponse.json({ success: true, inserted, message: `新增 ${inserted} 筆價格歷史` });
}
