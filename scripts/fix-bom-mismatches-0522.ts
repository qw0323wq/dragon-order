/**
 * 修復鍋底 BOM 的 item_id 錯指
 *
 * 用法:
 *   npx tsx scripts/_fix-bom-mismatches.ts          # dry-run 預覽
 *   npx tsx scripts/_fix-bom-mismatches.ts --apply  # 真實執行
 *
 * 範圍(共 30 筆,自動跳過「乾小椒」3 筆):
 *   - 6 個食材 × 3 鍋底 (高信心 score≥0.67) = 20 筆
 *   - 蔥段 → 青蔥（幕府）= 7 筆
 *   - 薑片 → 老薑（幕府）= 3 筆
 *
 * Terry 已拍板:
 *   - 蔥段/薑片 對到單一 SKU,「切法」資訊記在 BOM notes/quantity
 *   - 乾小椒先跳過(SKU 待確認)
 *   - 蕃茄醬→番茄底料、菌湯包→菌菇底料 雖 score 低但其實對,不動
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

// 對應規則:ingredient_name (normalized) → SKU 候選關鍵字
const RULES: Array<{
  ingredientPattern: RegExp;       // BOM.ingredient_name 比對(允許【XX半】前綴)
  targetItemNameLike: string;       // items.name LIKE 模式
  targetSupplier?: string;          // 額外限制供應商
  label: string;                    // 顯示用
}> = [
  { ingredientPattern: /^(【.+?】)?燈籠椒$/,  targetItemNameLike: '燈籠椒%',          label: '燈籠椒 → 燈籠椒2.5kg' },
  { ingredientPattern: /^(【.+?】)?米酒$/,    targetItemNameLike: '米酒%',            label: '米酒 → 米酒6L' },
  { ingredientPattern: /^(【.+?】)?酒釀$/,    targetItemNameLike: '酒釀%',            label: '酒釀 → 酒釀4斤' },
  { ingredientPattern: /^(【.+?】)?紅棗$/,    targetItemNameLike: '紅棗%',            label: '紅棗 → 紅棗600g' },
  { ingredientPattern: /^(【.+?】)?枸杞$/,    targetItemNameLike: '枸杞%',            label: '枸杞 → 枸杞600g' },
  { ingredientPattern: /^(【.+?】)?花椒粒$/,  targetItemNameLike: '花椒%',            label: '花椒粒 → 花椒1kg' },
  { ingredientPattern: /^(【.+?】)?蔥段$/,    targetItemNameLike: '青蔥%', targetSupplier: '幕府', label: '蔥段 → 青蔥（幕府）' },
  { ingredientPattern: /^(【.+?】)?薑片$/,    targetItemNameLike: '老薑%', targetSupplier: '幕府', label: '薑片 → 老薑（幕府）' },
];

async function main() {
  console.log(`\n${APPLY ? '🚀 APPLY MODE — 將真實更新' : '🔍 DRY-RUN — 不會寫入,加 --apply 才執行'}\n`);

  // 1. 先解析每個 rule 對到的 target_item_id
  const targets: Array<{ rule: typeof RULES[0]; targetItemId: number; targetItemName: string; targetSupplier: string }> = [];

  for (const rule of RULES) {
    let candidates;
    if (rule.targetSupplier) {
      candidates = await sql`
        SELECT i.id, i.name, s.name AS supplier
        FROM items i LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.name LIKE ${rule.targetItemNameLike} AND s.name = ${rule.targetSupplier} AND i.is_active
      `;
    } else {
      candidates = await sql`
        SELECT i.id, i.name, s.name AS supplier
        FROM items i LEFT JOIN suppliers s ON i.supplier_id = s.id
        WHERE i.name LIKE ${rule.targetItemNameLike} AND i.is_active
      `;
    }
    if (candidates.length === 0) {
      console.error(`❌ rule「${rule.label}」找不到 target SKU`);
      process.exit(1);
    }
    if (candidates.length > 1) {
      console.warn(`⚠️ rule「${rule.label}」有 ${candidates.length} 個候選,選第一個:`);
      candidates.forEach(c => console.warn(`   - #${c.id} ${c.name} (${c.supplier})`));
    }
    const c = candidates[0];
    targets.push({ rule, targetItemId: c.id, targetItemName: c.name as string, targetSupplier: c.supplier as string });
  }

  // 2. 對每個 rule 跑 update(或 dry-run)
  let totalUpdates = 0;
  for (const t of targets) {
    const matches = await sql`
      SELECT b.id, m.name AS menu_name, b.ingredient_name, b.item_id, i.name AS current_item
      FROM bom_items b
      LEFT JOIN menu_items m ON b.menu_item_id = m.id
      LEFT JOIN items i ON b.item_id = i.id
      WHERE b.ingredient_name ~ ${t.rule.ingredientPattern.source}
        AND (b.item_id IS NULL OR b.item_id != ${t.targetItemId})
    `;
    if (matches.length === 0) continue;

    console.log(`\n▶ ${t.rule.label} (target: #${t.targetItemId} ${t.targetItemName})`);
    for (const m of matches) {
      console.log(`   BOM#${m.id} [${m.menu_name}] 「${m.ingredient_name}」  從「${m.current_item ?? '∅'}」→ 「${t.targetItemName}」`);
    }

    if (APPLY) {
      const ids = matches.map(m => m.id);
      const result = await sql`
        UPDATE bom_items
        SET item_id = ${t.targetItemId}
        WHERE id = ANY(${ids})
      `;
      console.log(`   ✅ 更新 ${result.count} 筆`);
    }
    totalUpdates += matches.length;
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  總計: ${totalUpdates} 筆 ${APPLY ? '已修復' : '將被修復(尚未執行)'}`);
  if (!APPLY) {
    console.log(`  確認無誤 → 加 --apply 真實執行`);
  }
  console.log(`═══════════════════════════════════════\n`);

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
