/**
 * 為 store_inventory 加唯一索引 (item_id, store_id)
 *
 * 為什麼：原本沒有唯一約束，兩人同時對同一 (item, store) 做庫存異動時，
 * SELECT-then-INSERT 競態會產生重複列，之後每筆異動被套用到多列 → 庫存暴增。
 *
 * store_id 可為 NULL（總公司倉庫），用 COALESCE(store_id, -1) 讓 NULL 視為同一 bucket
 * （純 UNIQUE 對 NULL 視為相異，擋不住總公司倉庫的重複）。
 *
 * 前置：已確認線上 0 筆重複（若有需先合併）。冪等：IF NOT EXISTS。
 *
 * 用法：npx tsx scripts/migrate-store-inventory-unique.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });
  try {
    // 再次確認無重複（保險）
    const dups = await c`
      SELECT item_id, COALESCE(store_id, -1) AS sid, COUNT(*)::int n
      FROM store_inventory GROUP BY item_id, COALESCE(store_id, -1) HAVING COUNT(*) > 1
    `;
    if (dups.length > 0) {
      console.error(`❌ 仍有 ${dups.length} 組重複，請先合併再加約束`);
      console.error(JSON.stringify(dups.slice(0, 10)));
      process.exit(1);
    }
    console.log('✓ 確認無重複列');

    await c.unsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_store_inventory_item_store
        ON store_inventory (item_id, COALESCE(store_id, -1))
    `);
    console.log('✓ 唯一索引 uniq_store_inventory_item_store 建立（item_id + store_id，NULL 視為 -1）');
    console.log('\n✅ 完成 — 之後併發庫存異動不會再產生重複列');
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error('❌', e); process.exit(1); });
