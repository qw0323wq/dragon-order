/**
 * 通用版：讀供應商報價 Excel，比對 DB 現價，預覽將建立的排程
 *
 * Usage:
 *   npx tsx scripts/preview-price-schedule.ts \
 *     --xlsx "/path/to/xxx.xlsx" \
 *     --supplier VG-01 \
 *     --date 2026-04-15 \
 *     --source "幕府 4/15-4/20 報價單"
 *
 * 或簡寫：
 *   npx tsx scripts/preview-price-schedule.ts \
 *     "/path/to/xxx.xlsx" VG-01 2026-04-15 "幕府 4/15-4/20 報價單"
 *
 * 僅預覽，不寫 DB。會產出 JSON 計畫檔到 scripts/plans/<date>-<supplier>.json
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import postgres from 'postgres';

// ── 參數解析 ────────────────────────────────────────
function getArg(flag: string, short?: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === flag || (short && a === short));
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1];
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const XLSX_PATH = getArg('--xlsx') ?? positional[0];
const SUPPLIER_CODE = getArg('--supplier') ?? positional[1];
const EFFECTIVE_DATE = getArg('--date') ?? positional[2];
const SOURCE_LABEL = getArg('--source') ?? positional[3] ?? '';

if (!XLSX_PATH || !SUPPLIER_CODE || !EFFECTIVE_DATE) {
  console.error('用法: npx tsx scripts/preview-price-schedule.ts <xlsx> <supplier_code> <YYYY-MM-DD> [source]');
  console.error('  或: --xlsx ... --supplier ... --date ... --source ...');
  process.exit(1);
}

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`❌ 找不到檔案：${XLSX_PATH}`);
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(EFFECTIVE_DATE)) {
  console.error(`❌ 日期格式錯誤（需 YYYY-MM-DD）：${EFFECTIVE_DATE}`);
  process.exit(1);
}

// ── 工具 ────────────────────────────────────────────
function normalize(name: string): string {
  return String(name)
    .replace(/[（(][^)）]*[)）]/g, '') // 去括號註記
    .replace(/\s+/g, '')
    .trim();
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v);
}

async function main() {
  console.log(`\n📂 Excel：${XLSX_PATH}`);
  console.log(`📌 供應商：${SUPPLIER_CODE}`);
  console.log(`📅 生效日：${EFFECTIVE_DATE}`);
  console.log(`🏷️  來源：${SOURCE_LABEL || '(未指定)'}\n`);

  const wb = XLSX.readFile(XLSX_PATH!);
  console.log(`   Sheets: ${wb.SheetNames.join(', ')}\n`);

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

    // 找 header row
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
      console.log(`📑 Sheet「${sheetName}」無 header，跳過`);
      continue;
    }

    let currentSection = '';
    let parsed = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row[nameCol];
      const unit = unitCol >= 0 ? row[unitCol] : null;
      const price = priceCol >= 0 ? row[priceCol] : null;
      const notes = notesCol >= 0 ? row[notesCol] : null;

      if (!name && !price) continue;

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

    console.log(`📑 Sheet「${sheetName}」讀到 ${parsed} 個品項`);
  }

  console.log(`\n✅ 合計 ${items.length} 個有報價的品項\n`);

  if (items.length === 0) {
    console.error('❌ 沒讀到任何品項');
    process.exit(1);
  }

  // 查 DB
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const [supplier] = await sql`
    SELECT id, name FROM suppliers WHERE code = ${SUPPLIER_CODE!}
  `;
  if (!supplier) {
    console.error(`❌ 找不到供應商 code=${SUPPLIER_CODE}`);
    await sql.end();
    process.exit(1);
  }

  console.log(`📦 DB 供應商：${supplier.name} (ID=${supplier.id})\n`);

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

  type ChangeRow = {
    itemId: number;
    dbName: string;
    sku: string;
    unit: string;
    newPrice: number;
    oldPrice: number;
    diff: number;
    excelName: string;
    excelUnit: string | null;
    notes: string | null;
  };
  const willChange: ChangeRow[] = [];
  const noChange: { itemId: number; dbName: string; price: number; excelName: string }[] = [];
  const zeroPrice: ExcelItem[] = [];
  const unmatched: ExcelItem[] = [];

  for (const ex of items) {
    // price = 0 視為「本期不供應」，另外列出讓人決定
    if (ex.price === 0) {
      zeroPrice.push(ex);
      continue;
    }

    const key = normalize(ex.name);
    let db = dbMap.get(key);
    if (!db) {
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
        itemId: db.id,
        dbName: db.name,
        sku: db.sku,
        unit: db.unit,
        newPrice: ex.price,
        oldPrice: db.cost_price,
        diff,
        excelName: ex.name,
        excelUnit: ex.unit,
        notes: ex.notes,
      });
    } else {
      noChange.push({ itemId: db.id, dbName: db.name, price: ex.price, excelName: ex.name });
    }
  }

  const matchedDbIds = new Set([
    ...willChange.map((x) => x.itemId),
    ...noChange.map((x) => x.itemId),
  ]);
  const missingFromExcel = dbItems.filter((d) => !matchedDbIds.has(d.id) && d.is_active);

  // ── 輸出報告 ──
  console.log('═════════════════════════════════════════════════════════════');
  console.log(`  📝 價格排程預覽（生效 ${EFFECTIVE_DATE}）`);
  console.log('═════════════════════════════════════════════════════════════\n');

  console.log(`🔺 將改價（${willChange.length} 筆）：\n`);
  if (willChange.length > 0) {
    willChange.sort((a, b) => b.diff - a.diff);
    for (const x of willChange) {
      const name = String(x.dbName).padEnd(14, '　').slice(0, 14);
      const unit = String(x.unit || '').padEnd(3, ' ');
      const arrow = `${String(x.oldPrice).padStart(4)}→${String(x.newPrice).padStart(4)}`;
      const pct = x.oldPrice > 0 ? ` (${((x.diff / x.oldPrice) * 100).toFixed(0)}%)` : '';
      const diffStr = (x.diff > 0 ? `+${x.diff}` : `${x.diff}`) + pct;
      const id = String(x.itemId).padStart(4);
      const notes = x.notes ? ` [${x.notes}]` : '';
      console.log(
        `  ${id} | ${(x.sku || '').padEnd(7)} | ${name} | ${unit} | ${arrow} | ${diffStr.padEnd(8)} | ${x.excelName}${notes}`
      );
    }
  }

  console.log(`\n✅ 無變動（${noChange.length} 筆）`);
  if (noChange.length > 0 && noChange.length <= 50) {
    console.log('    ' + noChange.map((x) => `${x.dbName}($${x.price})`).join('、'));
  }

  if (zeroPrice.length > 0) {
    console.log(`\n🚫 Excel 標 $0（${zeroPrice.length} 筆，建議停用 is_active=false）：`);
    for (const z of zeroPrice) {
      const notes = z.notes ? ` [${z.notes}]` : '';
      console.log(`   • ${z.name}（${z.unit || '?'}）${notes}`);
    }
  }

  if (unmatched.length > 0) {
    console.log(`\n❓ Excel 有但 DB 對不到（${unmatched.length} 筆）：`);
    for (const u of unmatched) {
      const notes = u.notes ? ` [${u.notes}]` : '';
      console.log(
        `   • [${u.sheet}/${u.section}] ${u.name}（${u.unit || '?'}）$${u.price}${notes}`
      );
    }
  }

  if (missingFromExcel.length > 0) {
    console.log(
      `\n⚠️  DB 有但 Excel 沒報價（${missingFromExcel.length} 筆）：`
    );
    const shown = missingFromExcel.slice(0, 15);
    for (const d of shown) {
      console.log(`   • ${d.name}（${d.unit}）$${d.cost_price}`);
    }
    if (missingFromExcel.length > shown.length) {
      console.log(`   ... 共 ${missingFromExcel.length} 筆（顯示前 ${shown.length}）`);
    }
  }

  // ── 產出 JSON 計畫檔 ──
  const plansDir = path.join(process.cwd(), 'scripts', 'plans');
  if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });

  const planFile = path.join(plansDir, `${EFFECTIVE_DATE}-${SUPPLIER_CODE}.json`);
  const plan = {
    supplier: { id: supplier.id, code: SUPPLIER_CODE, name: supplier.name },
    effectiveDate: EFFECTIVE_DATE,
    source: SOURCE_LABEL,
    generatedAt: new Date().toISOString(),
    xlsxPath: XLSX_PATH,
    schedules: willChange.map((x) => ({
      itemId: x.itemId,
      name: x.dbName,
      sku: x.sku,
      unit: x.unit,
      oldPrice: x.oldPrice,
      newPrice: x.newPrice,
      diff: x.diff,
      notes: x.notes,
    })),
    deactivate: zeroPrice.map((z) => ({
      excelName: z.name,
      excelUnit: z.unit,
      notes: z.notes,
    })),
    unmatched: unmatched.map((u) => ({
      name: u.name,
      unit: u.unit,
      price: u.price,
      notes: u.notes,
      sheet: u.sheet,
      section: u.section,
    })),
  };
  fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf8');

  console.log(`\n═════════════════════════════════════════════════════════════`);
  console.log(`  💾 計畫檔：${planFile}`);
  console.log(`  👉 確認 OK 後跑：npx tsx scripts/apply-price-schedule.ts ${planFile}`);
  console.log(`═════════════════════════════════════════════════════════════\n`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
