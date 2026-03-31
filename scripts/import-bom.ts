/**
 * 匯入 BOM（配方對照表）— 從 Excel 匯入菜單商品 + 配方明細
 *
 * 執行：npx tsx scripts/import-bom.ts
 *
 * 資料來源：
 * - data/火鍋店進銷存統整表(完整版).xlsx → Sheet "2.BOM表對應(含成本)"
 *
 * 欄位：菜單商品名稱 | 售價 | 品項1 | 扣量1 | 品項2 | 扣量2 | 品項3 | 扣量3 | 每份成本 | 毛利 | 毛利率 | 說明
 *
 * 行為：
 * - 同名菜品已存在 → 更新售價/成本/毛利率 + 重建 BOM 明細
 * - 不存在 → 新增菜品 + BOM 明細
 * - BOM 中的品項名稱會嘗試匹配 DB items 表，匹配到就記錄 item_id
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

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// ── 找最新版本的檔案（與 update-costs.ts 相同邏輯）──
function findLatestFile(dir: string, baseName: string): string {
  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  const files = fs.readdirSync(dir).filter(f => f.startsWith(stem) && f.endsWith(ext));

  if (files.length === 0) {
    throw new Error(`找不到檔案：${baseName}（在 ${dir}）`);
  }

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

// ── 品項名稱模糊匹配 ──
function normalize(s: string): string {
  return s.replace(/\s+/g, '').replace(/[（）()]/g, '').replace(/\//g, '').toLowerCase();
}

function matchItem(excelName: string, dbItems: schema.Item[]): schema.Item | null {
  const n = normalize(excelName);
  let match = dbItems.find(i => normalize(i.name) === n);
  if (match) return match;
  match = dbItems.find(i => normalize(i.name).includes(n) || n.includes(normalize(i.name)));
  if (match) return match;
  match = dbItems.find(i =>
    i.aliases?.some(a => normalize(a) === n || n.includes(normalize(a)) || normalize(a).includes(n))
  );
  return match || null;
}

// ── Excel 分類標題 → DB category 對照 ──
function parseCategory(header: string): string {
  const map: Record<string, string> = {
    '鍋底': '鍋底',
    '肉品': '肉品',
    '海鮮': '海鮮',
    '火鍋料': '火鍋料',
    '手工': '火鍋料',
    '特色': '特色',
    '內臟': '特色',
    '蔬菜': '蔬菜',
    '菇': '蔬菜',
    '飲料': '飲料',
    '酒': '酒類',
  };
  for (const [key, val] of Object.entries(map)) {
    if (header.includes(key)) return val;
  }
  return '其他';
}

async function run() {
  console.log('📊 開始匯入 BOM 配方表...\n');

  // 取得 DB 所有原料品項（用來匹配 BOM 食材）
  const dbItems = await db.select().from(schema.items);
  console.log(`DB 現有 ${dbItems.length} 個原料品項`);

  // 取得 DB 現有菜單商品
  const existingMenu = await db.select().from(schema.menuItems);
  console.log(`DB 現有 ${existingMenu.length} 個菜單商品\n`);

  // 讀取 Excel
  const filePath = findLatestFile('./data', '火鍋店進銷存統整表(完整版).xlsx');
  console.log(`📁 讀取：${filePath}\n`);
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['2.BOM表對應(含成本)'], { header: 1 }) as any[][];

  let created = 0;
  let updated = 0;
  let currentCategory = '其他';

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;

    const name = String(r[0]).trim();

    // 分類標題行（【xxx】格式）
    if (name.startsWith('【')) {
      currentCategory = parseCategory(name);
      console.log(`\n── ${name} → ${currentCategory} ──`);
      continue;
    }

    const sellPrice = typeof r[1] === 'number' ? Math.round(r[1]) : 0;
    const costPerServing = typeof r[8] === 'number' ? r[8] : 0;
    const marginRate = typeof r[10] === 'number' ? r[10] : 0;
    const notes = r[11] ? String(r[11]).trim() : null;

    // 解析 BOM 明細（最多 3 組 pair）
    const ingredients: Array<{ ingredientName: string; quantity: string; itemId: number | null }> = [];
    for (let p = 0; p < 3; p++) {
      const ingName = r[2 + p * 2];
      const ingQty = r[3 + p * 2];
      if (ingName && String(ingName).trim()) {
        const matched = matchItem(String(ingName).trim(), dbItems);
        ingredients.push({
          ingredientName: String(ingName).trim(),
          quantity: ingQty ? String(ingQty).trim() : '',
          itemId: matched?.id ?? null,
        });
      }
    }

    // 檢查是否已存在
    const existing = existingMenu.find(m => normalize(m.name) === normalize(name));

    if (existing) {
      // 更新菜品資訊
      await db.update(schema.menuItems).set({
        sellPrice,
        costPerServing: String(costPerServing),
        marginRate: String(marginRate),
        notes: notes || existing.notes,
        category: currentCategory,
      }).where(eq(schema.menuItems.id, existing.id));

      // 刪除舊 BOM 明細，重建
      await db.delete(schema.bomItems).where(eq(schema.bomItems.menuItemId, existing.id));
      for (let idx = 0; idx < ingredients.length; idx++) {
        const ing = ingredients[idx];
        await db.insert(schema.bomItems).values({
          menuItemId: existing.id,
          itemId: ing.itemId,
          ingredientName: ing.ingredientName,
          quantity: ing.quantity,
          sortOrder: idx + 1,
        });
      }

      updated++;
      const ingStr = ingredients.map(ig => `${ig.ingredientName}(${ig.quantity})`).join(' + ');
      console.log(`  ♻️  ${name} $${sellPrice} ← ${ingStr}`);
    } else {
      // 新增菜品
      const [newMenu] = await db.insert(schema.menuItems).values({
        name,
        category: currentCategory,
        sellPrice,
        costPerServing: String(costPerServing),
        marginRate: String(marginRate),
        notes,
      }).returning({ id: schema.menuItems.id });

      // 新增 BOM 明細
      for (let idx = 0; idx < ingredients.length; idx++) {
        const ing = ingredients[idx];
        await db.insert(schema.bomItems).values({
          menuItemId: newMenu.id,
          itemId: ing.itemId,
          ingredientName: ing.ingredientName,
          quantity: ing.quantity,
          sortOrder: idx + 1,
        });
      }

      created++;
      const ingStr = ingredients.map(ig => `${ig.ingredientName}(${ig.quantity})`).join(' + ');
      console.log(`  ✅ ${name} $${sellPrice} ← ${ingStr}`);
    }
  }

  console.log(`\n🎉 BOM 匯入完成！新增 ${created} 道菜、更新 ${updated} 道菜`);
}

run().catch((err) => {
  console.error('❌ 失敗：', err);
  process.exit(1);
});
