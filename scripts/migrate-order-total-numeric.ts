/**
 * orders.total_amount / purchase_orders.total_amount：integer → numeric(10,2)
 *
 * 為什麼：金額其他欄位早就是 numeric(10,2)（支援 $63.3/公斤 這種小數價），
 * 但訂單總額還是 integer，SUM 被 ::int 截掉分 → 訂單總額跟明細加總對不起來。
 *
 * int → numeric 是加寬轉型，無資料遺失。冪等（重跑安全）。
 *
 * 用法：npx tsx scripts/migrate-order-total-numeric.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });
  try {
    for (const t of ['orders', 'purchase_orders']) {
      const [col] = await c`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = ${t} AND column_name = 'total_amount'
      ` as unknown as Array<{ data_type: string }>;
      if (!col) { console.log(`ℹ ${t} 無 total_amount，跳過`); continue; }
      if (col.data_type === 'numeric') { console.log(`ℹ ${t}.total_amount 已是 numeric，跳過`); continue; }
      await c.unsafe(`ALTER TABLE ${t} ALTER COLUMN total_amount TYPE numeric(10,2)`);
      console.log(`✓ ${t}.total_amount ${col.data_type} → numeric(10,2)`);
    }
    console.log('\n✅ 完成');
  } finally {
    await c.end();
  }
}
main().catch((e) => { console.error('❌', e); process.exit(1); });
