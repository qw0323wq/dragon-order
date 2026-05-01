/**
 * 套用：幕府 0429~0505 報價更新
 *
 * 用法：npx tsx scripts/apply-mufu-0429.ts
 *
 * 流程：
 *  1. 補 alias 對齊（大白菜←山東白菜、秀珍菇←袖珍菇）
 *  2. 整批 update cost_price / supplier_notes（包 transaction）
 *  3. 寫 item_price_history（source='幕府報價 04/29-05/05'）
 *  4. 報價單沒有的品項保留現況（不動）
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
const SOURCE_LABEL = '幕府報價 04/29-05/05';

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

  try {
    // ── Phase 1：補 alias ──
    const aliasUpdates = [
      { dbName: '大白菜', alias: '山東白菜' },
      { dbName: '秀珍菇', alias: '袖珍菇' },
    ];
    console.log('=== Phase 1: alias 對齊 ===');
    for (const { dbName, alias } of aliasUpdates) {
      const all = await db.select().from(schema.items);
      const item = all.find((i) => normalize(i.name) === normalize(dbName));
      if (!item) {
        console.warn(`  ⚠ 找不到 DB 項目「${dbName}」，跳過`);
        continue;
      }
      const existing = item.aliases ?? [];
      if (existing.includes(alias)) {
        console.log(`  ℹ ${dbName} 已有 alias「${alias}」`);
        continue;
      }
      // CRITICAL: 用 array_append 避免 race（concurrent update 也安全）
      await client`UPDATE items SET aliases = array_append(COALESCE(aliases, ARRAY[]::text[]), ${alias}) WHERE id = ${item.id}`;
      console.log(`  ✓ ${dbName} 加 alias「${alias}」`);
    }

    // ── Phase 2：找供應商 + DB 品項 ──
    const [supplier] = await db
      .select()
      .from(schema.suppliers)
      .where(eq(schema.suppliers.name, SUPPLIER_NAME));
    if (!supplier) throw new Error(`找不到供應商 ${SUPPLIER_NAME}`);

    const dbItems = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.supplierId, supplier.id));
    console.log(`\n✓ 供應商：${supplier.name} / DB 共 ${dbItems.length} 項`);

    // ── Phase 3：matching（first-come，從 pool 移除避免重複）──
    const pool = [...dbItems];
    function findAndRemove(name: string) {
      const n = normalize(name);
      // 1) 名稱完全相符
      let idx = pool.findIndex((i) => normalize(i.name) === n);
      // 2) alias 完全相符
      if (idx === -1)
        idx = pool.findIndex((i) =>
          i.aliases?.some((a) => normalize(a) === n)
        );
      // 3) 名稱 substring（雙向）
      if (idx === -1)
        idx = pool.findIndex(
          (i) =>
            normalize(i.name).includes(n) ||
            n.includes(normalize(i.name))
        );
      // 4) alias substring（雙向）
      if (idx === -1)
        idx = pool.findIndex((i) =>
          i.aliases?.some(
            (a) =>
              normalize(a).includes(n) ||
              n.includes(normalize(a))
          )
        );
      if (idx === -1) return null;
      const [m] = pool.splice(idx, 1);
      return m;
    }

    const quotes = parseExcel();
    console.log(`✓ 報價表 ${quotes.length} 項\n`);

    // ── Phase 4：整批更新（包在 transaction 內） ──
    type Result = {
      excelName: string;
      matchedName: string | null;
      oldCost: number | null;
      newCost: number;
      noteChanged: boolean;
      newNotes: string | null;
    };
    const results: Result[] = [];

    await client.begin(async (tx) => {
      for (const q of quotes) {
        const m = findAndRemove(q.name);
        if (!m) {
          results.push({
            excelName: q.name,
            matchedName: null,
            oldCost: null,
            newCost: q.cost,
            noteChanged: false,
            newNotes: null,
          });
          continue;
        }
        const oldCost = Number(m.costPrice);
        const newCost = q.cost;
        const newNotes = q.notes;
        const noteChanged =
          newNotes !== null && newNotes !== m.supplierNotes;
        const priceChanged = oldCost !== newCost;

        if (priceChanged) {
          await tx`UPDATE items SET cost_price = ${newCost} WHERE id = ${m.id}`;
          // 寫 price history
          const diff = newCost - oldCost;
          const pct = oldCost > 0 ? ((diff / oldCost) * 100).toFixed(2) : '0';
          await tx`
            INSERT INTO item_price_history
              (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
            VALUES
              (${m.id}, ${oldCost}, ${newCost}, ${diff}, ${pct}, ${m.unit ?? ''},
               CURRENT_DATE, ${SOURCE_LABEL})
          `;
        }
        if (noteChanged) {
          await tx`UPDATE items SET supplier_notes = ${newNotes} WHERE id = ${m.id}`;
        }

        results.push({
          excelName: q.name,
          matchedName: m.name,
          oldCost,
          newCost,
          noteChanged,
          newNotes,
        });
      }
    });

    // ── Phase 5：報告 ──
    let upCount = 0;
    let downCount = 0;
    let sameCount = 0;
    let noteCount = 0;
    let unmatchedCount = 0;

    console.log('=== 結果 ===');
    for (const r of results) {
      if (!r.matchedName) {
        unmatchedCount++;
        console.log(`  ❓ ${r.excelName.padEnd(20)} $${r.newCost} （未對應，跳過）`);
        continue;
      }
      const oldCost = r.oldCost!;
      const diff = r.newCost - oldCost;
      const arrow = diff > 0 ? '⬆' : diff < 0 ? '⬇' : '＝';
      const priceStr =
        diff === 0
          ? `$${oldCost}`
          : `$${oldCost} → $${r.newCost} (${diff > 0 ? '+' : ''}${diff})`;
      const noteStr = r.noteChanged ? ` 📝 ${r.newNotes}` : '';
      console.log(`  ${arrow} ${r.matchedName.padEnd(20)} ${priceStr}${noteStr}`);

      if (diff > 0) upCount++;
      else if (diff < 0) downCount++;
      else sameCount++;
      if (r.noteChanged) noteCount++;
    }

    console.log('\n────────────────────────');
    console.log(
      `📊 合計：⬆漲 ${upCount} / ⬇降 ${downCount} / ＝持平 ${sameCount} / 📝備註更新 ${noteCount} / ❓未對應 ${unmatchedCount}`
    );
    console.log('────────────────────────');
    console.log(`✓ history source: ${SOURCE_LABEL}`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('❌ 失敗：', err);
  process.exit(1);
});
