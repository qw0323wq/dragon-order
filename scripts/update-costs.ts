/**
 * 更新品項成本 — 從 Excel 報價表匯入最新成本/售價/安全庫存
 *
 * 執行：npx tsx scripts/update-costs.ts
 *
 * 資料來源：
 * - data/火鍋店進銷存統整表(完整版).xlsx → 品項總覽與成本（每份成本+售價+安全庫存）
 * - data/食材成本｜總表 (2).xlsx → 肉品/酒水/生鮮（最新含稅報價）
 *
 * data/ 是 symlink → 採購資料夾
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as schema from '../src/lib/db/schema';

/**
 * 找最新版本的檔案
 * 例如：食材成本｜總表 (2).xlsx 有多個版本：
 *   食材成本｜總表 (2).xlsx              （原始版）
 *   食材成本｜總表 (2)_更新20260317.xlsx
 *   食材成本｜總表 (2)_更新20260318.xlsx
 * → 回傳日期最大的那個，沒有帶日期的版本則作為 fallback
 */
function findLatestFile(dir: string, baseName: string): string {
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  const files = fs.readdirSync(dir).filter(f => f.startsWith(stem) && f.endsWith(ext));

  if (files.length === 0) {
    throw new Error(`找不到檔案：${baseName}（在 ${dir}）`);
  }

  // 提取日期，排序取最新
  const dated = files
    .map(f => {
      const m = f.match(/_更新(\d{8})/);
      return { file: f, date: m ? m[1] : '00000000' };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const chosen = dated[0].file;
  if (chosen !== baseName) {
    console.log(`  📌 找到更新版本：${chosen}`);
  }
  return path.join(dir, chosen);
}

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// 品項名稱模糊匹配（Excel 名稱可能跟 DB 不完全一樣）
function normalize(s: string): string {
  return s.replace(/\s+/g, '').replace(/[（）()]/g, '').replace(/\//g, '').toLowerCase();
}

function matchItem(excelName: string, dbItems: schema.Item[]): schema.Item | null {
  const n = normalize(excelName);
  // 完全一致
  let match = dbItems.find(i => normalize(i.name) === n);
  if (match) return match;
  // DB 名稱包含 Excel 名稱
  match = dbItems.find(i => normalize(i.name).includes(n) || n.includes(normalize(i.name)));
  if (match) return match;
  // aliases 匹配
  match = dbItems.find(i =>
    i.aliases?.some(a => normalize(a) === n || n.includes(normalize(a)) || normalize(a).includes(n))
  );
  return match || null;
}

async function run() {
  console.log('📊 開始更新品項成本...\n');

  // 取得 DB 所有品項
  const dbItems = await db.select().from(schema.items);
  console.log(`DB 現有 ${dbItems.length} 個品項\n`);

  let updated = 0;
  let skipped = 0;

  // ─── 1. 品項總覽（最完整：成本+售價+安全庫存） ───
  console.log('📁 讀取：火鍋店進銷存統整表(完整版)');
  const wb1 = XLSX.readFile(findLatestFile('./data', '火鍋店進銷存統整表(完整版).xlsx'));
  const overview = XLSX.utils.sheet_to_json(wb1.Sheets['1.品項總覽與成本'], { header: 1 }) as any[][];

  for (let i = 1; i < overview.length; i++) {
    const r = overview[i];
    if (!r || !r[1] || !r[2] || r[0] === r[1]) continue; // 跳過分類標題

    const excelName = String(r[1]).trim();
    const costPerServe = r[6]; // 分店成本(/份)
    const sellPrice = r[7]; // 分店售價(/份)
    const safetyStock = r[11]; // 安全庫存量

    if (!costPerServe && !sellPrice) continue;

    const match = matchItem(excelName, dbItems);
    if (!match) {
      skipped++;
      continue;
    }

    const updates: Record<string, any> = {};
    if (costPerServe && typeof costPerServe === 'number') {
      updates.costPrice = Math.round(costPerServe);
    }
    if (sellPrice && typeof sellPrice === 'number') {
      updates.sellPrice = Math.round(sellPrice);
    }
    if (safetyStock && typeof safetyStock === 'number') {
      updates.safetyStock = String(safetyStock);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(schema.items).set(updates).where(eq(schema.items.id, match.id));
      updated++;
      console.log(`  ✅ ${match.name} ← ${excelName} (成本:$${updates.costPrice || '-'}, 售價:$${updates.sellPrice || '-'})`);
    }
  }

  // ─── 2. 肉品報價（更精確的含稅成本） ───
  console.log('\n📁 讀取：食材成本總表 → 肉品');
  const wb2 = XLSX.readFile(findLatestFile('./data', '食材成本｜總表 (2).xlsx'));
  const meat = XLSX.utils.sheet_to_json(wb2.Sheets['肉品'], { header: 1 }) as any[][];

  for (let i = 2; i < meat.length; i++) {
    const r = meat[i];
    if (!r || !r[0]) continue;
    const excelName = String(r[0]).trim();
    const costPerServe = r[11]; // 分店每份成本含稅
    const sellPerServe = r[12]; // 分店售價含稅

    const match = matchItem(excelName, dbItems);
    if (!match) continue;

    const updates: Record<string, any> = {};
    if (costPerServe && typeof costPerServe === 'number') {
      updates.costPrice = Math.round(costPerServe);
    }
    if (sellPerServe && typeof sellPerServe === 'number') {
      updates.sellPrice = Math.round(sellPerServe);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(schema.items).set(updates).where(eq(schema.items.id, match.id));
      updated++;
      console.log(`  ✅ ${match.name} ← 肉品/${excelName} (成本:$${updates.costPrice}, 售價:$${updates.sellPrice})`);
    }
  }

  // ─── 3. 酒水報價 ───
  console.log('\n📁 讀取：食材成本總表 → 酒水');
  const drinks = XLSX.utils.sheet_to_json(wb2.Sheets['酒水'], { header: 1 }) as any[][];

  for (let i = 2; i < drinks.length; i++) {
    const r = drinks[i];
    if (!r || !r[0]) continue;
    const excelName = String(r[0]).trim().split(/\s/)[0]; // 取品名（去掉容量）
    const costPerBottle = r[9]; // 分店成本
    const sellPerBottle = r[10]; // 分店售價

    const match = matchItem(excelName, dbItems);
    if (!match) continue;

    const updates: Record<string, any> = {};
    if (costPerBottle && typeof costPerBottle === 'number') {
      updates.costPrice = Math.round(costPerBottle);
    }
    if (sellPerBottle && typeof sellPerBottle === 'number') {
      updates.sellPrice = Math.round(sellPerBottle);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(schema.items).set(updates).where(eq(schema.items.id, match.id));
      updated++;
      console.log(`  ✅ ${match.name} ← 酒水/${excelName} (成本:$${updates.costPrice}, 售價:$${updates.sellPrice})`);
    }
  }

  // ─── 4. 生鮮報價 ───
  console.log('\n📁 讀取：食材成本總表 → 生鮮食材');
  const fresh = XLSX.utils.sheet_to_json(wb2.Sheets['生鮮食材(未完成)'], { header: 1 }) as any[][];

  for (let i = 2; i < fresh.length; i++) {
    const r = fresh[i];
    if (!r || !r[0]) continue;
    const excelName = String(r[0]).trim().split(/\s/)[0]; // 取品名
    const costPerServe = r[11]; // 分店每份成本
    const sellPerServe = r[12]; // 分店售價

    const match = matchItem(excelName, dbItems);
    if (!match) continue;

    const updates: Record<string, any> = {};
    if (costPerServe && typeof costPerServe === 'number' && costPerServe > 0) {
      updates.costPrice = Math.round(costPerServe);
    }
    if (sellPerServe && typeof sellPerServe === 'number') {
      updates.sellPrice = Math.round(sellPerServe);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(schema.items).set(updates).where(eq(schema.items.id, match.id));
      updated++;
      console.log(`  ✅ ${match.name} ← 生鮮/${excelName} (成本:$${updates.costPrice || '-'}, 售價:$${updates.sellPrice || '-'})`);
    }
  }

  console.log(`\n🎉 更新完成！共更新 ${updated} 個品項，${skipped} 個未匹配`);
}

run().catch((err) => {
  console.error('❌ 失敗：', err);
  process.exit(1);
});
