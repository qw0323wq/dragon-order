/**
 * POST /api/price-history/upload — 上傳供應商報價單 Excel
 *
 * 流程：
 * 1. 解析 Excel（支援以曜格式）
 * 2. 比對現有品項的進貨價
 * 3. 有差異的 → 記錄到 item_price_history + 更新 items.cost_price
 * 4. 回傳比對結果（漲/跌/不變/新品項）
 *
 * Body: FormData { file: xlsx, supplier_id: string, effective_date?: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { rawSql as sql } from '@/lib/db';
import { requireAdmin } from '@/lib/api-auth';
import * as XLSX from 'xlsx';
import { parseIntSafe } from '@/lib/parse-int-safe';

/** 每份克數（用於 per-kg 和 per-portion 之間的換算） */
const GRAMS_PER_SERVING = 120;
/** 每公斤克數 */
const GRAMS_PER_KG = 1000;
/** 價差容忍值（元/kg），低於此值視為價格不變 */
const PRICE_TOLERANCE_PER_KG = 3;

interface PriceRow {
  name: string;
  pricePerKg: number;
  spec?: string;
  grade?: string;
  notes?: string;
}

/** 解析以曜報價單格式 */
function parseYiyaoQuote(sheet: XLSX.WorkSheet): PriceRow[] {
  const rows: PriceRow[] = [];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  for (let r = range.s.r + 3; r <= range.e.r; r++) {
    // 左半邊：A=項次, B=品名, C=規格, D=等級, E=單價/KG
    const itemNo = sheet[XLSX.utils.encode_cell({ r, c: 0 })]?.v;
    const name = sheet[XLSX.utils.encode_cell({ r, c: 1 })]?.v;
    const spec = sheet[XLSX.utils.encode_cell({ r, c: 2 })]?.v;
    const grade = sheet[XLSX.utils.encode_cell({ r, c: 3 })]?.v;
    const price = sheet[XLSX.utils.encode_cell({ r, c: 4 })]?.v;
    const notes = sheet[XLSX.utils.encode_cell({ r, c: 5 })]?.v;

    if (typeof itemNo === 'number' && name && typeof price === 'number') {
      rows.push({
        name: String(name).trim(),
        pricePerKg: price,
        spec: spec ? String(spec) : undefined,
        grade: grade ? String(grade) : undefined,
        notes: notes ? String(notes) : undefined,
      });
    }
  }

  return rows;
}

/** 通用格式解析（品名 + 單價欄位） */
function parseGenericQuote(sheet: XLSX.WorkSheet): PriceRow[] {
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const rows: PriceRow[] = [];

  for (const row of data) {
    const name = row['品名'] || row['品項'] || row['名稱'] || row['商品名稱'];
    const price = row['單價'] || row['單價/KG'] || row['報價'] || row['廠商報價'] || row['廠商報價(含稅)'];

    if (name && typeof price === 'number') {
      rows.push({
        name: String(name).trim(),
        pricePerKg: price,
      });
    }
  }

  return rows;
}

export async function POST(req: NextRequest) {
  // CRITICAL: 報價上傳會修改進貨價，僅限管理員操作
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const supplierId = formData.get('supplier_id') as string | null;
  const effectiveDate = (formData.get('effective_date') as string) || new Date().toISOString().slice(0, 10);
  const source = (formData.get('source') as string) || '上傳報價單';

  if (!file || !supplierId) {
    return NextResponse.json({ error: '需要 file 和 supplier_id' }, { status: 400 });
  }

  const parsedSupplierId = parseIntSafe(supplierId);
  if (parsedSupplierId === null) {
    return NextResponse.json({ error: '無效的供應商 ID' }, { status: 400 });
  }

  // 讀取 Excel
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // 嘗試解析（先以曜格式，失敗再用通用格式）
  let quoteRows = parseYiyaoQuote(sheet);
  if (quoteRows.length === 0) {
    quoteRows = parseGenericQuote(sheet);
  }

  if (quoteRows.length === 0) {
    return NextResponse.json({ error: '無法解析報價單，找不到品項和價格' }, { status: 400 });
  }

  // 取得該供應商的所有品項
  const items = await sql`
    SELECT id, name, cost_price, spec, aliases
    FROM items
    WHERE supplier_id = ${parsedSupplierId} AND is_active = true
  `;

  // 建立名稱 → item 的對照（含 aliases）
  const itemByName = new Map<string, { id: number; name: string; cost_price: number }>();
  for (const item of items) {
    const mapped = { id: item.id as number, name: item.name as string, cost_price: item.cost_price as number };
    itemByName.set(mapped.name, mapped);
    const aliases = item.aliases as string[] | null;
    if (aliases) {
      for (const alias of aliases) {
        itemByName.set(alias, mapped);
      }
    }
  }

  // 比對價格
  const results: {
    matched: { name: string; itemName: string; oldPrice: number; newPrice: number; diff: number; pct: string }[];
    unchanged: { name: string; price: number }[];
    unmatched: { name: string; price: number }[];
  } = { matched: [], unchanged: [], unmatched: [] };

  for (const row of quoteRows) {
    // 嘗試多種匹配方式
    let item = itemByName.get(row.name);

    // 模糊匹配：移除空格和特殊字符
    if (!item) {
      const cleaned = row.name.replace(/\s+/g, '').replace(/[()（）]/g, '');
      for (const [key, val] of itemByName) {
        if (key.replace(/\s+/g, '').replace(/[()（）]/g, '') === cleaned) {
          item = val;
          break;
        }
      }
    }

    if (!item) {
      results.unmatched.push({ name: row.name, price: row.pricePerKg });
      continue;
    }

    // 計算每份成本（假設 120g/份 for per-kg items）
    // 注意：cost_price 在 DB 裡是 per portion，但報價單是 per kg
    // 這裡存的是 per-kg 報價歷史
    const oldKgPrice = Math.round((item.cost_price / GRAMS_PER_SERVING) * GRAMS_PER_KG);
    const diff = row.pricePerKg - oldKgPrice;

    if (Math.abs(diff) < PRICE_TOLERANCE_PER_KG) {
      // 價差小於 3 元/kg 視為不變
      results.unchanged.push({ name: row.name, price: row.pricePerKg });
      continue;
    }

    const pct = ((diff / oldKgPrice) * 100).toFixed(2);

    // 記錄價格歷史
    await sql`
      INSERT INTO item_price_history (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
      VALUES (${item.id}, ${oldKgPrice}, ${row.pricePerKg}, ${diff}, ${pct}, 'kg', ${effectiveDate}, ${source})
    `;

    // 更新品項的 per-portion cost
    const newPortionCost = Math.round((row.pricePerKg / GRAMS_PER_KG) * GRAMS_PER_SERVING);
    await sql`UPDATE items SET cost_price = ${newPortionCost} WHERE id = ${item.id}`;

    results.matched.push({
      name: row.name,
      itemName: item.name,
      oldPrice: oldKgPrice,
      newPrice: row.pricePerKg,
      diff,
      pct,
    });
  }

  return NextResponse.json({
    parsed: quoteRows.length,
    updated: results.matched.length,
    unchanged: results.unchanged.length,
    unmatched: results.unmatched.length,
    details: results,
  });
}
