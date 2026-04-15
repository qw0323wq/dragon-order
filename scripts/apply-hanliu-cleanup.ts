/**
 * 韓流品項整合 — 一次性整理腳本（單一 transaction）
 *
 * 動作：
 *   1. 對齊 #54 板豆腐 → 西北板豆腐 $16→$63 + alias ['板豆腐']
 *   2. 對齊 #55 生豆包（韓流） $15→$75 + alias ['生豆包']
 *   3. 排程 #57 鴨血（韓流） $10→$13 生效 2026-04-16（走 price-schedule）
 *   4. 新建 11 個韓流批發裝品項（HP-029 ~ HP-039）+ 各自 aliases
 *   5. 停用 16 個過時 DB 韓流品項（is_active=false）
 *
 * 冪等：重跑安全（IF NOT EXISTS / SKU 重複會錯但有事先檢查）
 *
 * 使用：npx tsx scripts/apply-hanliu-cleanup.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const HANLIU_SUPPLIER_ID = 6;
const SOURCE = '韓流 4/15-4/21 報價單';
const SCHEDULE_EFFECTIVE_DATE = '2026-04-16';

// 11 個新建品項
type NewItem = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  aliases: string[];
};

const NEW_ITEMS: NewItem[] = [
  { sku: 'HP-029', name: '福茂貢丸（韓流）',     category: '火鍋料', unit: '包/3kg',  costPrice: 665,  aliases: ['福茂貢丸'] },
  { sku: 'HP-030', name: '福茂香菇貢丸（韓流）', category: '火鍋料', unit: '包/3kg',  costPrice: 700,  aliases: ['福茂香菇貢丸'] },
  { sku: 'HP-031', name: '福茂芋頭貢丸（韓流）', category: '火鍋料', unit: '包/3kg',  costPrice: 710,  aliases: ['福茂芋頭貢丸'] },
  { sku: 'HP-032', name: '大武芋頭心（韓流）',   category: '火鍋料', unit: '包/3kg',  costPrice: 440,  aliases: ['大武芋頭心'] },
  { sku: 'HP-033', name: '金利華花枝丸（韓流）', category: '火鍋料', unit: '包/3kg',  costPrice: 630,  aliases: ['金利華花枝丸'] },
  { sku: 'HP-034', name: '蝦仁漿(元本)（韓流）', category: '火鍋料', unit: '箱/6kg',  costPrice: 1950, aliases: ['蝦仁漿(元本)', '蝦仁漿'] },
  { sku: 'HP-035', name: '凍豆腐（韓流）',       category: '豆製品', unit: '包/3kg',  costPrice: 220,  aliases: ['凍豆腐'] },
  { sku: 'HP-036', name: '玲玲捲（韓流）',       category: '火鍋料', unit: '盒',     costPrice: 80,   aliases: ['玲玲捲'] },
  { sku: 'HP-037', name: '刻花魷魚（韓流）',     category: '海鮮',   unit: '台斤',   costPrice: 140,  aliases: ['刻花魷魚'] },
  { sku: 'HP-038', name: '手工水晶餃(20入)（韓流）', category: '火鍋料', unit: '盒', costPrice: 66, aliases: ['手工水晶餃(20入)', '手工水晶餃'] },
  { sku: 'HP-039', name: '炸豆皮(手指圈)（韓流）', category: '豆製品', unit: '包/台斤', costPrice: 140, aliases: ['炸豆皮(手指圈)', '炸豆皮'] },
];

// 16 個要停用的 DB 韓流品項（不含 #54 #55 #57 — 那 3 個保留更新）
const DEACTIVATE_IDS = [43, 56, 64, 65, 66, 67, 68, 69, 70, 71, 74, 88, 89, 90, 91, 138];

// 對齊 ID
const ALIGN_BANTOFU_ID = 54;     // 板豆腐 → 西北板豆腐 $63
const ALIGN_SHENGDOUBAO_ID = 55; // 生豆包（韓流） $15→$75
const SCHEDULE_DUCKBLOOD_ID = 57; // 鴨血（韓流） $10→$13 排程

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  console.log('🔌 連線\n');

  let aligned = 0;
  let scheduled = 0;
  let inserted = 0;
  let skippedInsert = 0;
  let deactivated = 0;
  let alreadyInactive = 0;

  try {
    await sql.begin(async (tx) => {
      // ── 1. 對齊 #54 板豆腐 → 西北板豆腐 $63 ──
      console.log('🩹 [1/5] 對齊 #54 板豆腐 → 西北板豆腐 $16→$63');
      const [item54] = await tx`SELECT name, cost_price, aliases FROM items WHERE id = ${ALIGN_BANTOFU_ID}` as any;
      const newAliases54 = Array.from(new Set([...(item54.aliases || []), '板豆腐']));
      await tx`
        UPDATE items SET name = '西北板豆腐', cost_price = 63, aliases = ${newAliases54}
        WHERE id = ${ALIGN_BANTOFU_ID}
      `;
      console.log(`   ✅ #54 從「${item54.name} $${item54.cost_price}」改為「西北板豆腐 $63」, aliases=${JSON.stringify(newAliases54)}`);
      aligned++;

      // ── 2. 對齊 #55 生豆包（韓流） $15→$75 ──
      console.log('\n🩹 [2/5] 對齊 #55 生豆包（韓流）$15→$75');
      const [item55] = await tx`SELECT name, cost_price, aliases FROM items WHERE id = ${ALIGN_SHENGDOUBAO_ID}` as any;
      const newAliases55 = Array.from(new Set([...(item55.aliases || []), '生豆包']));
      await tx`
        UPDATE items SET cost_price = 75, aliases = ${newAliases55}
        WHERE id = ${ALIGN_SHENGDOUBAO_ID}
      `;
      console.log(`   ✅ #55 ${item55.name} $${item55.cost_price}→$75, aliases=${JSON.stringify(newAliases55)}`);
      aligned++;

      // ── 3. 排程 #57 鴨血（韓流）$10→$13（走 price-schedule） ──
      console.log('\n📅 [3/5] 建排程 #57 鴨血（韓流）$10→$13 生效 2026-04-16');
      const existingSched = await tx`
        SELECT id FROM scheduled_price_changes
        WHERE item_id = ${SCHEDULE_DUCKBLOOD_ID}
          AND effective_date = ${SCHEDULE_EFFECTIVE_DATE}
          AND status = 'pending'
      `;
      if (existingSched.length > 0) {
        console.log(`   ⏭️  已有 pending 排程 #${existingSched[0].id}，跳過`);
      } else {
        const [created] = await tx`
          INSERT INTO scheduled_price_changes
            (item_id, new_cost_price, effective_date, source, status)
          VALUES (${SCHEDULE_DUCKBLOOD_ID}, 13, ${SCHEDULE_EFFECTIVE_DATE}, ${SOURCE}, 'pending')
          RETURNING id
        `;
        console.log(`   ✅ 排程 #${created.id} 建立`);
        scheduled++;
      }

      // ── 4. 新建 11 個韓流批發品項 ──
      console.log('\n🆕 [4/5] 新建韓流批發品項');
      console.log('────────────────────────────────────────');
      for (const it of NEW_ITEMS) {
        const existing = await tx`SELECT id FROM items WHERE sku = ${it.sku}`;
        if (existing.length > 0) {
          console.log(`   ⏭️  ${it.sku} ${it.name} — SKU 已存在 (#${existing[0].id})，跳過`);
          skippedInsert++;
          continue;
        }
        const [row] = await tx`
          INSERT INTO items (sku, name, category, unit, cost_price, sell_price, supplier_id, aliases, is_active)
          VALUES (${it.sku}, ${it.name}, ${it.category}, ${it.unit}, ${it.costPrice}, 0, ${HANLIU_SUPPLIER_ID}, ${it.aliases}, true)
          RETURNING id
        `;
        console.log(`   ✅ #${row.id} ${it.sku} | ${it.name.padEnd(20, '　')} | ${it.unit.padEnd(8)} | $${it.costPrice} | aliases=${JSON.stringify(it.aliases)}`);
        inserted++;
      }

      // ── 5. 停用 16 個過時品項 ──
      console.log('\n🚫 [5/5] 停用過時 DB 韓流品項');
      console.log('────────────────────────────────────────');
      for (const id of DEACTIVATE_IDS) {
        const [item] = await tx`SELECT name, sku, is_active FROM items WHERE id = ${id}` as any;
        if (!item) {
          console.log(`   ⚠️  #${id} 找不到，跳過`);
          continue;
        }
        if (!item.is_active) {
          console.log(`   ⏭️  #${id} ${item.sku} ${item.name} — 已是停用`);
          alreadyInactive++;
          continue;
        }
        await tx`UPDATE items SET is_active = false WHERE id = ${id}`;
        console.log(`   ✅ #${id} ${item.sku} ${item.name} 停用`);
        deactivated++;
      }
    });
  } catch (e) {
    console.error('\n❌ Transaction rollback：', e);
    await sql.end();
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════');
  console.log('🎉 完成');
  console.log('════════════════════════════════════════');
  console.log(`  對齊（即時改）：${aligned} 筆`);
  console.log(`  排程（4/16 生效）：${scheduled} 筆`);
  console.log(`  新建品項：${inserted} 筆（跳過 ${skippedInsert}）`);
  console.log(`  停用品項：${deactivated} 筆（已停用 ${alreadyInactive}）`);
  console.log('');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
