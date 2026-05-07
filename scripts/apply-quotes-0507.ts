/**
 * 套用三份新報價（2026-05-07）
 *  - 幕府 0506~0512.xlsx        週報價（蔬菜）
 *  - 韓流（加工品+滷煮）           月報價
 *  - 以曜 2026年5月份報價單        月報價（肉品）
 *
 * 用法：npx tsx scripts/apply-quotes-0507.ts
 *
 * 邊角案例處理：
 *  - 「x」/ 字串型報價         → 不動價，加備註「本週缺貨」
 *  - 範圍價（300~500）        → 跳過（需手動）
 *  - 單位不同的 match         → 跳過（避免直接覆蓋）
 *  - DB 沒有的品項            → 跳過（不主動新增）
 *  - 雙等級雙價（CH/SEL）      → 各拆一筆，DB 名稱含哪個等級就 match 哪個
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import * as schema from '../src/lib/db/schema';

const FILES = {
  mufu: '/Users/terry/Desktop/肥龍報價(幕府)0506~0512.xlsx',
  hanliu: '/Users/terry/Desktop/肥龍報價(韓流).xlsx',
  yiyao: '/Users/terry/Desktop/2026年5月份肥龍老火鍋報價單.xlsx',
};

interface QuoteRow {
  name: string;
  unit: string;
  cost: number | null;          // null = 缺貨/範圍價，要跳過更新
  costNote?: string | null;     // 替代備註（如「本週缺貨」「範圍價 300~500」）
  notes: string | null;
  /** 雙等級才填（如 'CH'），用來和 DB 名稱比對 */
  grade?: string | null;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').replace(/[（）()]/g, '').replace(/[／/]/g, '').toLowerCase();
}

// ─── 解析三家報價 ───

function parseMufu(): QuoteRow[] {
  const wb = XLSX.readFile(FILES.mufu);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['廠商報價蔬菜'], { header: 1 }) as unknown[][];
  const out: QuoteRow[] = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = r[0];
    const unit = r[1];
    const cost = r[2];
    const notes = r[3] ?? null;
    if (!name || typeof name !== 'string') continue;
    if (typeof cost === 'number') {
      out.push({ name: name.trim(), unit: String(unit ?? ''), cost, notes: typeof notes === 'string' ? notes : null });
    } else if (cost === 'x' || cost === 'X') {
      // 缺貨：不動價，但更新備註
      const noteSuffix = typeof notes === 'string' && notes ? `${notes}（本週缺貨）` : '本週缺貨';
      out.push({
        name: name.trim(),
        unit: String(unit ?? ''),
        cost: null,
        costNote: '本週缺貨',
        notes: noteSuffix,
      });
    }
  }
  return out;
}

function parseHanliu(): QuoteRow[] {
  const wb = XLSX.readFile(FILES.hanliu);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['廠商報價蔬菜'], { header: 1 }) as unknown[][];
  const out: QuoteRow[] = [];
  // row 0=標題、1=加工品 header、2-16=加工品（未稅）
  // row 17=滷煮 header、18-22=滷煮（含稅，「536/kg」字串）
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = r[0];
    if (!name || typeof name !== 'string' || String(name).trim() === '產品名稱') continue;

    const unit = r[1];
    const priceCell = r[2] ?? r[3];   // 加工品在 col 2、滷煮表在 col 3
    if (priceCell == null || priceCell === '') continue;

    if (typeof priceCell === 'number') {
      out.push({ name: name.trim(), unit: String(unit ?? ''), cost: priceCell, notes: null });
    } else if (typeof priceCell === 'string') {
      // 範圍價 300~500 / 含稅報價 536/kg / 純文字
      const rangeMatch = priceCell.match(/^(\d+)\s*[~～]\s*(\d+)/);
      const slashMatch = priceCell.match(/^(\d+(?:\.\d+)?)\s*\//);
      if (rangeMatch) {
        out.push({
          name: name.trim(),
          unit: String(unit ?? ''),
          cost: null,
          costNote: `範圍價 ${priceCell}（需手動）`,
          notes: `報價 ${priceCell}`,
        });
      } else if (slashMatch) {
        // 「536/kg」→ 536（含稅，存原數字）
        out.push({
          name: name.trim(),
          unit: String(unit ?? ''),
          cost: parseFloat(slashMatch[1]),
          notes: r[2] ? `產地：${r[2]}` : null,
        });
      } else {
        out.push({
          name: name.trim(),
          unit: String(unit ?? ''),
          cost: null,
          costNote: `非數字報價：${priceCell}`,
          notes: null,
        });
      }
    }
  }
  return out;
}

function parseYiyao(): QuoteRow[] {
  const wb = XLSX.readFile(FILES.yiyao);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { header: 1 }) as unknown[][];
  const out: QuoteRow[] = [];
  // row 5 是 header（兩欄並列），row 6+ 是資料
  // 左欄 col 0-5：項次/品名/規格/等級/單價/備註  → 目前交易
  // 右欄 col 7-12：項次/品名/規格/等級/單價/備註  → 可參考品項（先全部當報價）
  function pushRow(name: unknown, unit: unknown, grade: unknown, price: unknown, notes: unknown) {
    if (!name || typeof name !== 'string') return;
    const cleanName = name.trim();
    if (cleanName === '品     名' || cleanName.startsWith('產品報價') || cleanName.startsWith('※')) return;

    // 雙等級「CH/SEL」+ 雙價「460/415」→ 拆兩筆
    const gradeStr = typeof grade === 'string' ? grade.trim() : '';
    const priceStr = typeof price === 'string' || typeof price === 'number' ? String(price).trim() : '';
    const grades = gradeStr.split(/[/／]/).map(s => s.trim()).filter(Boolean);
    const prices = priceStr.split(/[/／]/).map(s => parseFloat(s.trim())).filter(p => !isNaN(p));

    const noteStr = typeof notes === 'string' ? notes.trim() : null;
    const unitStr = typeof unit === 'string' ? unit.trim() : '公斤';

    if (grades.length >= 2 && prices.length >= 2) {
      // 雙等級：各拆一筆
      for (let k = 0; k < Math.min(grades.length, prices.length); k++) {
        out.push({
          name: cleanName,
          unit: unitStr,
          cost: prices[k],
          notes: noteStr,
          grade: grades[k],
        });
      }
    } else if (prices.length >= 1) {
      out.push({
        name: cleanName,
        unit: unitStr,
        cost: prices[0],
        notes: noteStr,
        grade: gradeStr || null,
      });
    }
  }

  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] ?? [];
    pushRow(r[1], r[2], r[3], r[4], r[5]);   // 左欄
    pushRow(r[8], r[9], r[10], r[11], r[12]); // 右欄
  }
  return out;
}

// ─── matching ───

function makeMatcher(items: schema.Item[]) {
  const pool = [...items];
  return function match(q: QuoteRow): schema.Item | null {
    const n = normalize(q.name);
    // 等級存在時，優先要求 DB 名稱含該等級字串（CH/SEL/PR 等）
    const gradeRe = q.grade ? new RegExp(q.grade, 'i') : null;

    function tryFind(predicate: (i: schema.Item) => boolean): schema.Item | null {
      const idx = pool.findIndex(predicate);
      if (idx === -1) return null;
      const [m] = pool.splice(idx, 1);
      return m;
    }

    // 1) 等級 + 名稱完全相符
    if (gradeRe) {
      const m = tryFind(i => gradeRe.test(i.name) && (normalize(i.name).includes(n) || n.includes(normalize(i.name))));
      if (m) return m;
    }
    // 2) 名稱完全相符
    let m = tryFind(i => normalize(i.name) === n);
    if (m) return m;
    // 3) alias 完全相符
    m = tryFind(i => i.aliases?.some(a => normalize(a) === n) ?? false);
    if (m) return m;
    // 4) 名稱 substring（雙向）— 但若 quote 有等級且 DB 名稱含其他等級，跳過
    m = tryFind(i => {
      if (gradeRe) {
        const otherGrades = ['PR', 'CH', 'SEL', 'SELECT'].filter(g => !gradeRe.test(g));
        for (const g of otherGrades) {
          if (new RegExp(`\\b${g}\\b`).test(i.name)) return false;
        }
      }
      return normalize(i.name).includes(n) || n.includes(normalize(i.name));
    });
    if (m) return m;
    // 5) alias substring
    m = tryFind(i => i.aliases?.some(a => normalize(a).includes(n) || n.includes(normalize(a))) ?? false);
    return m;
  };
}

// ─── 主流程 ───

interface UpdateResult {
  supplier: string;
  quoteName: string;
  matched: schema.Item | null;
  oldCost: number | null;
  newCost: number | null;
  unitMatch: boolean;
  priceChanged: boolean;
  notesChanged: boolean;
  newNotes: string | null;
  skipReason: string | null;
}

async function processSupplier(
  db: ReturnType<typeof drizzle>,
  client: ReturnType<typeof postgres>,
  supplierName: string,
  quotes: QuoteRow[],
  sourceLabel: string,
): Promise<UpdateResult[]> {
  const [supplier] = await db.select().from(schema.suppliers).where(eq(schema.suppliers.name, supplierName));
  if (!supplier) {
    console.warn(`⚠ 找不到供應商「${supplierName}」，跳過`);
    return [];
  }
  const items = await db.select().from(schema.items).where(eq(schema.items.supplierId, supplier.id));
  // 主匹配池：active 優先；inactive 留作備援
  const activeItems = items.filter(i => i.isActive);
  const matcher = makeMatcher(activeItems);
  const results: UpdateResult[] = [];

  await client.begin(async (tx) => {
    for (const q of quotes) {
      const m = matcher(q);
      const r: UpdateResult = {
        supplier: supplierName,
        quoteName: q.name + (q.grade ? ` [${q.grade}]` : ''),
        matched: m,
        oldCost: m ? Number(m.costPrice) : null,
        newCost: q.cost,
        unitMatch: false,
        priceChanged: false,
        notesChanged: false,
        newNotes: null,
        skipReason: null,
      };

      if (!m) {
        r.skipReason = '未對應到 DB 品項';
        results.push(r);
        continue;
      }

      // 缺貨/範圍價 → 不動價，但寫備註
      if (q.cost === null) {
        r.skipReason = q.costNote ?? '報價無數字';
        // 只更新備註
        if (q.notes && q.notes !== m.supplierNotes) {
          await tx`UPDATE items SET supplier_notes = ${q.notes} WHERE id = ${m.id}`;
          r.notesChanged = true;
          r.newNotes = q.notes;
        }
        results.push(r);
        continue;
      }

      // 單位不同 → 跳過（避免單位換算誤差）
      const dbUnit = (m.unit ?? '').replace(/\s+/g, '');
      const quoteUnit = (q.unit ?? '').replace(/\s+/g, '');
      // 只有「KG vs 公斤」「斤 vs 台斤」當作相同
      const unitEq =
        dbUnit === quoteUnit ||
        (dbUnit === '公斤' && quoteUnit === 'KG') ||
        (dbUnit === 'KG' && quoteUnit === '公斤') ||
        (dbUnit === '斤' && quoteUnit === '台斤') ||
        (dbUnit === '台斤' && quoteUnit === '斤');
      r.unitMatch = unitEq;

      if (!unitEq) {
        r.skipReason = `單位不同（DB:${dbUnit} / 報價:${quoteUnit}）`;
        results.push(r);
        continue;
      }

      const oldCost = Number(m.costPrice);
      const newCost = q.cost;
      const priceChanged = oldCost !== newCost;
      const notesChanged = q.notes != null && q.notes !== m.supplierNotes;

      if (priceChanged) {
        await tx`UPDATE items SET cost_price = ${newCost} WHERE id = ${m.id}`;
        const diff = newCost - oldCost;
        const pct = oldCost > 0 ? ((diff / oldCost) * 100).toFixed(2) : '0';
        await tx`
          INSERT INTO item_price_history
            (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
          VALUES
            (${m.id}, ${oldCost}, ${newCost}, ${diff}, ${pct}, ${m.unit ?? ''},
             CURRENT_DATE, ${sourceLabel})
        `;
        r.priceChanged = true;
      }
      if (notesChanged) {
        await tx`UPDATE items SET supplier_notes = ${q.notes} WHERE id = ${m.id}`;
        r.notesChanged = true;
        r.newNotes = q.notes;
      }
      results.push(r);
    }
  });

  return results;
}

function printReport(label: string, results: UpdateResult[]) {
  const ups = results.filter(r => r.priceChanged && r.newCost! > r.oldCost!);
  const downs = results.filter(r => r.priceChanged && r.newCost! < r.oldCost!);
  const sames = results.filter(r => r.matched && !r.priceChanged && !r.skipReason);
  const skipped = results.filter(r => r.skipReason);

  console.log(`\n══════ ${label} ══════`);
  if (ups.length) {
    console.log('⬆ 漲價：');
    for (const r of ups) {
      const noteStr = r.notesChanged ? ` 📝 ${r.newNotes}` : '';
      console.log(`  ${r.matched!.name.padEnd(28)} $${r.oldCost} → $${r.newCost}  (+$${r.newCost! - r.oldCost!})${noteStr}`);
    }
  }
  if (downs.length) {
    console.log('⬇ 降價：');
    for (const r of downs) {
      const noteStr = r.notesChanged ? ` 📝 ${r.newNotes}` : '';
      console.log(`  ${r.matched!.name.padEnd(28)} $${r.oldCost} → $${r.newCost}  ($${r.newCost! - r.oldCost!})${noteStr}`);
    }
  }
  if (sames.length) {
    console.log(`＝ 持平：${sames.length} 項${sames.some(r => r.notesChanged) ? '（部分有備註更新）' : ''}`);
    for (const r of sames.filter(s => s.notesChanged)) {
      console.log(`  ${r.matched!.name.padEnd(28)} $${r.oldCost} 📝 ${r.newNotes}`);
    }
  }
  if (skipped.length) {
    console.log('⏸ 跳過：');
    for (const r of skipped) {
      const target = r.matched ? r.matched.name : '（無對應）';
      console.log(`  ${r.quoteName.padEnd(28)} → ${target.padEnd(28)} （${r.skipReason}）`);
    }
  }
  console.log(`📊 ⬆${ups.length} / ⬇${downs.length} / ＝${sames.length} / ⏸${skipped.length}`);
}

async function run() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });
  try {
    const mufuRes = await processSupplier(db, client, '幕府', parseMufu(), '幕府報價 05/06-05/12');
    printReport('幕府 05/06-05/12', mufuRes);

    const hanliuRes = await processSupplier(db, client, '韓流', parseHanliu(), '韓流月報價 2026-05');
    printReport('韓流 2026-05', hanliuRes);

    const yiyaoRes = await processSupplier(db, client, '以曜', parseYiyao(), '以曜月報價 2026-05');
    printReport('以曜 2026-05', yiyaoRes);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('❌ 失敗：', err);
  process.exit(1);
});
