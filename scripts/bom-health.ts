/**
 * 一次性 BOM 健診 — 跑完即刪
 * 目的：盤點 ingredient 抽象重構前的資料現況
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  console.log('═════════════════════════════════════════════════');
  console.log('  BOM / Ingredient 重構前資料健診');
  console.log('═════════════════════════════════════════════════\n');

  // ── 1. 總覽 ─────────────────────────────
  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM items WHERE is_active) AS items_active,
      (SELECT COUNT(*)::int FROM items WHERE NOT is_active) AS items_inactive,
      (SELECT COUNT(*)::int FROM menu_items WHERE is_active) AS menu_active,
      (SELECT COUNT(*)::int FROM bom_items) AS bom_total,
      (SELECT COUNT(*)::int FROM bom_items WHERE item_id IS NOT NULL) AS bom_with_item,
      (SELECT COUNT(*)::int FROM bom_items WHERE item_id IS NULL) AS bom_without_item,
      (SELECT COUNT(DISTINCT ingredient_name)::int FROM bom_items WHERE ingredient_name IS NOT NULL AND ingredient_name != '') AS distinct_ingredient_names,
      (SELECT COUNT(DISTINCT menu_item_id)::int FROM bom_items) AS menus_with_bom
  `;

  console.log('📊 總覽');
  console.log(`   品項 items:       ${counts.items_active} active / ${counts.items_inactive} inactive`);
  console.log(`   菜單 menu_items:  ${counts.menu_active} active`);
  console.log(`   BOM 行數:         ${counts.bom_total} 筆`);
  console.log(`     ├─ 有對應 SKU:  ${counts.bom_with_item}`);
  console.log(`     └─ 只有食材名:  ${counts.bom_without_item}`);
  console.log(`   distinct 食材名:  ${counts.distinct_ingredient_names} 種`);
  console.log(`   有 BOM 的菜:      ${counts.menus_with_bom} 道`);
  console.log(`   無 BOM 的菜:      ${counts.menu_active - counts.menus_with_bom} 道\n`);

  // ── 2. distinct ingredient_name(已被用在 BOM 的食材)─────
  const ingredients = await sql`
    SELECT
      ingredient_name,
      COUNT(*)::int AS use_count,
      COUNT(DISTINCT menu_item_id)::int AS dish_count,
      COUNT(CASE WHEN item_id IS NULL THEN 1 END)::int AS unmapped_rows
    FROM bom_items
    WHERE ingredient_name IS NOT NULL AND ingredient_name != ''
    GROUP BY ingredient_name
    ORDER BY use_count DESC
  `;

  console.log(`🧂 BOM 內已存在的食材 (${ingredients.length} 種)`);
  console.log('   食材名稱                         用幾次  用在幾道菜  未對SKU');
  console.log('   ────────────────────────────────────────────────────────────');
  for (const ing of ingredients) {
    const name = (ing.ingredient_name as string).padEnd(28, ' ').slice(0, 28);
    console.log(`   ${name} ${String(ing.use_count).padStart(6)}  ${String(ing.dish_count).padStart(8)}    ${String(ing.unmapped_rows).padStart(5)}`);
  }
  console.log();

  // ── 3. quantity 欄位內容樣本(看字串長什麼樣)──────────
  const qtySamples = await sql`
    SELECT DISTINCT quantity
    FROM bom_items
    WHERE quantity IS NOT NULL AND quantity != ''
    ORDER BY quantity
    LIMIT 30
  `;
  console.log(`📏 quantity 欄位內容樣本 (前 30 種 distinct):`);
  console.log('   ' + qtySamples.map(q => `「${q.quantity}」`).join('、'));
  console.log();

  // ── 4. menu_items 列表 + 各自 BOM 對接狀態 ─────────────
  const menus = await sql`
    SELECT
      m.id, m.category, m.name, m.sell_price, m.cost_per_serving,
      COUNT(b.id)::int AS bom_lines,
      COUNT(b.item_id)::int AS mapped_lines
    FROM menu_items m
    LEFT JOIN bom_items b ON b.menu_item_id = m.id
    WHERE m.is_active
    GROUP BY m.id
    ORDER BY m.category, m.name
  `;
  console.log(`🍽  菜單 (${menus.length} 道)`);
  let curCat = '';
  for (const m of menus) {
    if (m.category !== curCat) {
      curCat = m.category;
      console.log(`\n   [${curCat}]`);
    }
    const name = (m.name as string).padEnd(20, ' ').slice(0, 20);
    const sell = `$${m.sell_price}`.padStart(6);
    const cost = `$${m.cost_per_serving ?? 0}`.padStart(8);
    const bomState = m.bom_lines === 0
      ? '無 BOM'
      : `BOM ${m.mapped_lines}/${m.bom_lines} 對到 SKU`;
    console.log(`   ${name} 售${sell} 成本${cost}  ${bomState}`);
  }

  console.log();
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
