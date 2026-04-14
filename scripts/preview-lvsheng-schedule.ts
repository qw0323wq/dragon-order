/**
 * 讀綠盛 4/16-4/30 新報價 Excel，比對 DB 現價，預覽將建立的排程
 *
 * 輸入：~/Desktop/肥龍老火鍋報價單-綠盛.xlsx
 * 動作：僅預覽，不寫 DB
 *
 * 使用：npx tsx scripts/preview-lvsheng-schedule.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import postgres from 'postgres';

const SOURCE_XLSX = path.join(os.homedir(), 'Desktop', '肥龍老火鍋報價單-綠盛.xlsx');
const SUPPLIER_CODE = 'VG-02'; // 綠盛
const EFFECTIVE_DATE = '2026-04-16';

/** 規格化品名以便模糊比對：拿掉「（綠盛）」、全形括號、空白 */
function normalize(name: string): string {
  return String(name)
    .replace(/[（(]綠盛[)）]/g, '')
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v);
}

async function main() {
  if (!fs.existsSync(SOURCE_XLSX)) {
    console.error(`❌ 找不到檔案：${SOURCE_XLSX}`);
    process.exit(1);
  }

  console.log(`📂 讀取：${SOURCE_XLSX}`);
  const wb = XLSX.readFile(SOURCE_XLSX);
  console.log(`   Sheets: ${wb.SheetNames.join(', ')}\n`);

  // 收集所有品項（跨多個 sheet）
  type ExcelItem = {
    name: string;
    unit: string | null;
    price: number;
    notes: string | null;
    sheet: string;
    section: string;
  };
  const items: ExcelItem[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    console.log(`📑 Sheet「${sheetName}」有 ${rows.length} 列，解析中...`);

    // 找 header row：含「品項/品名」的列
    let headerIdx = -1;
    let nameCol = 0,
      unitCol = 1,
      priceCol = 2,
      notesCol = 3;

    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i];
      const idx = row.findIndex(
        (c) => typeof c === 'string' && /品項|品名|名稱/.test(c)
      );
      if (idx !== -1) {
        headerIdx = i;
        nameCol = idx;
        // 找其他欄
        unitCol = row.findIndex(
          (c) => typeof c === 'string' && /單位|規格|重量/.test(c)
        );
        priceCol = row.findIndex(
          (c) => typeof c === 'string' && /價格|報價|售價|單價/.test(c)
        );
        notesCol = row.findIndex((c) => typeof c === 'string' && /備註/.test(c));
        break;
      }
    }

    if (headerIdx === -1) {
      console.log(`   ⚠️  找不到 header row，跳過此 sheet`);
      continue;
    }

    console.log(
      `   Header 第 ${headerIdx + 1} 列: 品名欄=${nameCol}, 單位欄=${unitCol}, 價格欄=${priceCol}, 備註欄=${notesCol}`
    );

    let currentSection = '';
    let parsed = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[nameCol];
      const unit = unitCol >= 0 ? row[unitCol] : null;
      const price = priceCol >= 0 ? row[priceCol] : null;
      const notes = notesCol >= 0 ? row[notesCol] : null;

      // 空列跳過
      if (!name && !price) continue;

      // Section header: 有品名但無單位無價格（如「蔬菜類」「火鍋料類」「大頭類」）
      if (typeof name === 'string' && !unit && !isNumber(price)) {
        currentSection = name.trim();
        continue;
      }

      if (typeof name !== 'string' || !isNumber(price)) continue;

      items.push({
        name: name.trim(),
        unit: unit ? String(unit).trim() : null,
        price,
        notes: notes ? String(notes).trim() : null,
        sheet: sheetName,
        section: currentSection,
      });
      parsed++;
    }

    console.log(`   ✅ 此 sheet 讀到 ${parsed} 個品項\n`);
  }

  console.log(`✅ 合計讀到 ${items.length} 個有報價的品項\n`);

  if (items.length === 0) {
    console.error('❌ 沒讀到任何品項，請檢查 Excel 格式');
    process.exit(1);
  }

  // 查 DB 綠盛品項
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const [supplier] = await sql`
    SELECT id, name FROM suppliers WHERE code = ${SUPPLIER_CODE}
  `;
  if (!supplier) {
    console.error(`❌ 找不到供應商 code=${SUPPLIER_CODE}`);
    await sql.end();
    process.exit(1);
  }

  const dbItems = (await sql`
    SELECT id, sku, name, unit, cost_price, is_active
    FROM items WHERE supplier_id = ${supplier.id}
  `) as unknown as {
    id: number;
    sku: string;
    name: string;
    unit: string;
    cost_price: number;
    is_active: boolean;
  }[];

  const dbMap = new Map<string, (typeof dbItems)[number]>();
  for (const it of dbItems) {
    dbMap.set(normalize(it.name), it);
  }

  // 比對
  type ChangeRow = {
    item: (typeof dbItems)[number];
    newPrice: number;
    oldPrice: number;
    diff: number;
    excelName: string;
    excelUnit: string | null;
    notes: string | null;
  };
  const willChange: ChangeRow[] = [];
  const noChange: { item: (typeof dbItems)[number]; price: number; excelName: string }[] = [];
  const unmatched: ExcelItem[] = [];

  for (const ex of items) {
    const key = normalize(ex.name);
    let db = dbMap.get(key);
    if (!db) {
      // 部分匹配 fallback
      db = dbItems.find((d) => {
        const dn = normalize(d.name);
        return dn.includes(key) || key.includes(dn);
      });
    }
    if (!db) {
      unmatched.push(ex);
      continue;
    }
    const diff = ex.price - db.cost_price;
    if (diff !== 0) {
      willChange.push({
        item: db,
        newPrice: ex.price,
        oldPrice: db.cost_price,
        diff,
        excelName: ex.name,
        excelUnit: ex.unit,
        notes: ex.notes,
      });
    } else {
      noChange.push({ item: db, price: ex.price, excelName: ex.name });
    }
  }

  const matchedDbIds = new Set([
    ...willChange.map((x) => x.item.id),
    ...noChange.map((x) => x.item.id),
  ]);
  const missingFromExcel = dbItems.filter((d) => !matchedDbIds.has(d.id) && d.is_active);

  // 輸出
  console.log('═════════════════════════════════════════════════════════════');
  console.log(`  📝 價格排程預覽（生效日 ${EFFECTIVE_DATE}）`);
  console.log('═════════════════════════════════════════════════════════════\n');

  console.log(`🔺 將建立排程的品項（${willChange.length} 筆）：\n`);
  if (willChange.length > 0) {
    console.log(
      'ID   | SKU      | 品名              | 單位 | 現→新     | 變動    | Excel 原名 (備註)'
    );
    console.log(
      '-----+----------+-------------------+------+-----------+---------+--------------------'
    );
    willChange.sort((a, b) => b.diff - a.diff);
    for (const x of willChange) {
      const name = String(x.item.name).padEnd(14, '　').slice(0, 14);
      const unit = String(x.item.unit || '').padEnd(3, ' ');
      const arrow = `${String(x.oldPrice).padStart(4)}→${String(x.newPrice).padStart(4)}`;
      const pct = x.oldPrice > 0 ? ` (${((x.diff / x.oldPrice) * 100).toFixed(0)}%)` : '';
      const diffStr = (x.diff > 0 ? `+${x.diff}` : `${x.diff}`) + pct;
      const id = String(x.item.id).padStart(4);
      const notes = x.notes ? ` (${x.notes})` : '';
      console.log(
        `${id} | ${(x.item.sku || '').padEnd(8)} | ${name} | ${unit}  | ${arrow} | ${diffStr.padEnd(7)} | ${x.excelName}${notes}`
      );
    }
  }

  console.log(`\n✅ 無變動（${noChange.length} 筆，不建排程）：`);
  if (noChange.length > 0) {
    console.log(
      '    ' + noChange.map((x) => `${x.item.name}($${x.price})`).join('、')
    );
  }

  if (unmatched.length > 0) {
    console.log(
      `\n❓ Excel 有但 DB 對不到（${unmatched.length} 筆）— 可能是新品或改名，需你決定：\n`
    );
    for (const u of unmatched) {
      const notes = u.notes ? ` 備註:${u.notes}` : '';
      console.log(
        `   • [${u.sheet}/${u.section}] ${u.name}（${u.unit || '?'}）$${u.price}${notes}`
      );
    }
  }

  if (missingFromExcel.length > 0) {
    console.log(
      `\n⚠️  DB 有但 Excel 沒報價（${missingFromExcel.length} 筆，啟用中）— 可能停賣：\n`
    );
    for (const d of missingFromExcel) {
      console.log(`   • ${d.name}（${d.unit}）DB 現價 $${d.cost_price}`);
    }
  }

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  👉 預覽完成，未寫 DB。確認 OK 後跑：');
  console.log('     npx tsx scripts/apply-lvsheng-schedule.ts');
  console.log('═════════════════════════════════════════════════════════════\n');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
