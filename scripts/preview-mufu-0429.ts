/**
 * 預覽：幕府 0429~0505 報價 vs DB 現價
 *
 * 用法：npx tsx scripts/preview-mufu-0429.ts
 *
 * 不會寫 DB，只列出差異報告。
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import * as schema from '../src/lib/db/schema';

const FILE = '/Users/terry/Desktop/肥龍報價(幕府)0429~0505.xlsx';
const SUPPLIER_NAME = '幕府';

interface QuoteRow {
  name: string;
  unit: string;
  cost: number;
  notes: string | null;
}

function normalize(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[（）()]/g, '')
    .replace(/[／/]/g, '')
    .toLowerCase();
}

function parseExcel(): QuoteRow[] {
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets['廠商報價蔬菜'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  const out: QuoteRow[] = [];
  // header is row 1, data starts row 3
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = r[0];
    const unit = r[1];
    const cost = r[2];
    const notes = r[3] ?? null;
    if (!name || typeof name !== 'string') continue;
    if (typeof cost !== 'number') continue;
    out.push({
      name: name.trim(),
      unit: typeof unit === 'string' ? unit.trim() : '',
      cost,
      notes: typeof notes === 'string' ? notes.trim() : null,
    });
  }
  return out;
}

async function run() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });

  // 找幕府供應商
  const [supplier] = await db
    .select()
    .from(schema.suppliers)
    .where(eq(schema.suppliers.name, SUPPLIER_NAME));
  if (!supplier) {
    console.error(`❌ 找不到供應商「${SUPPLIER_NAME}」`);
    process.exit(1);
  }
  console.log(`✓ 供應商：${supplier.name} (id=${supplier.id})`);

  // 拿 supplier 名下所有品項
  const dbItems = await db
    .select()
    .from(schema.items)
    .where(eq(schema.items.supplierId, supplier.id));
  console.log(`✓ DB 共 ${dbItems.length} 項幕府品項\n`);

  const quotes = parseExcel();
  console.log(`✓ 報價表 ${quotes.length} 項\n`);

  // 比對
  type Diff = {
    excelName: string;
    matched: schema.Item | null;
    oldCost: number | null;
    newCost: number;
    diff: number | null;
    notes: string | null;
  };
  const diffs: Diff[] = [];

  for (const q of quotes) {
    const n = normalize(q.name);
    let m =
      dbItems.find((i) => normalize(i.name) === n) ??
      dbItems.find(
        (i) =>
          normalize(i.name).includes(n) ||
          n.includes(normalize(i.name))
      ) ??
      dbItems.find((i) =>
        i.aliases?.some(
          (a) =>
            normalize(a) === n ||
            n.includes(normalize(a)) ||
            normalize(a).includes(n)
        )
      );

    diffs.push({
      excelName: q.name,
      matched: m ?? null,
      oldCost: m ? Number(m.costPrice) : null,
      newCost: q.cost,
      diff: m ? q.cost - Number(m.costPrice) : null,
      notes: q.notes,
    });
  }

  // 報告
  console.log('=== 漲價（成本上升）===');
  let upCount = 0;
  for (const d of diffs) {
    if (d.matched && d.diff !== null && d.diff > 0) {
      upCount++;
      console.log(
        `  ⬆ ${d.matched.name.padEnd(20)} $${d.oldCost} → $${d.newCost}  (+$${d.diff})${d.notes ? ` 📝 ${d.notes}` : ''}`
      );
    }
  }
  if (upCount === 0) console.log('  (無)');

  console.log('\n=== 降價（成本下降）===');
  let downCount = 0;
  for (const d of diffs) {
    if (d.matched && d.diff !== null && d.diff < 0) {
      downCount++;
      console.log(
        `  ⬇ ${d.matched.name.padEnd(20)} $${d.oldCost} → $${d.newCost}  ($${d.diff})${d.notes ? ` 📝 ${d.notes}` : ''}`
      );
    }
  }
  if (downCount === 0) console.log('  (無)');

  console.log('\n=== 持平 ===');
  let sameCount = 0;
  for (const d of diffs) {
    if (d.matched && d.diff === 0) {
      sameCount++;
      console.log(
        `  ＝ ${d.matched.name.padEnd(20)} $${d.oldCost}${d.notes ? ` 📝 ${d.notes}` : ''}`
      );
    }
  }
  if (sameCount === 0) console.log('  (無)');

  console.log('\n=== 報價單有但 DB 無（需要新增？）===');
  let unknownCount = 0;
  for (const d of diffs) {
    if (!d.matched) {
      unknownCount++;
      console.log(`  ❓ ${d.excelName.padEnd(20)} $${d.newCost}${d.notes ? ` 📝 ${d.notes}` : ''}`);
    }
  }
  if (unknownCount === 0) console.log('  (無)');

  console.log('\n=== DB 有但報價單無（停產？）===');
  const matchedIds = new Set(diffs.filter((d) => d.matched).map((d) => d.matched!.id));
  let staleCount = 0;
  for (const item of dbItems) {
    if (!matchedIds.has(item.id) && item.isActive) {
      staleCount++;
      console.log(
        `  ⏸ ${item.name.padEnd(20)} 現價 $${item.costPrice}`
      );
    }
  }
  if (staleCount === 0) console.log('  (無)');

  console.log('\n────────────────────────');
  console.log(
    `📊 合計：漲 ${upCount} / 降 ${downCount} / 持平 ${sameCount} / 待新增 ${unknownCount} / 待確認 ${staleCount}`
  );
  console.log('────────────────────────');

  await client.end();
}

run().catch((err) => {
  console.error('❌ 失敗：', err);
  process.exit(1);
});
