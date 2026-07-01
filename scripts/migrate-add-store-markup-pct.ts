/**
 * Migration：items 加 store_markup_pct（店家採購價加成 %）
 *
 * 用途：讓每個品項可自訂「店家採購價」的加成 %。
 *   店家採購價邏輯改為：
 *     store_price > 0（手動固定）→ 用 store_price
 *     否則 → round(cost_price × (1 + store_markup_pct/100))
 *
 * 預設 20（= 原本 COST_MARKUP 1.2），所以舊資料行為完全不變。
 *
 * 用法：npx tsx scripts/migrate-add-store-markup-pct.ts
 * 冪等：ADD COLUMN IF NOT EXISTS
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });
  try {
    console.log('=== 加 items.store_markup_pct ===');
    await c.unsafe(`
      ALTER TABLE items
        ADD COLUMN IF NOT EXISTS store_markup_pct NUMERIC(5, 2) NOT NULL DEFAULT 20
    `);
    console.log('✓ 欄位建立（預設 20%）');

    const [chk] = await c`
      SELECT COUNT(*)::int total,
             MIN(store_markup_pct) mn, MAX(store_markup_pct) mx
      FROM items
    ` as unknown as Array<{ total: number; mn: string; mx: string }>;
    console.log(`✓ 現有 ${chk.total} 品項，store_markup_pct 範圍 ${chk.mn}~${chk.mx}（應皆 20）`);

    console.log('\n✅ 完成');
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error('❌', e); process.exit(1); });
