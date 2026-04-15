/**
 * Migration: 14 個金額欄位 integer → numeric(10,2)
 *
 * 動機：報價單偶有小數（例如凍豆腐 $63.3/公斤），原本 integer 無法存
 *
 * 影響欄位：
 *   items: cost_price, sell_price, store_price
 *   order_items: unit_price, subtotal
 *   purchase_order_items: unit_price, subtotal
 *   payments: amount
 *   menu_items: sell_price
 *   item_price_history: old_price, new_price, price_diff
 *   scheduled_price_changes: new_cost_price, new_store_price
 *
 * PostgreSQL ALTER COLUMN integer → numeric(10,2) 是無損轉換
 * 既有 63 自動變 63.00，default 0 變 0.00
 *
 * 單一 transaction，幂等（重跑會偵測欄位已是 numeric 並跳過）
 *
 * 使用：npx tsx scripts/migrate-money-to-numeric.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

type ColChange = { table: string; column: string };

const COLUMNS: ColChange[] = [
  { table: 'items',                     column: 'cost_price' },
  { table: 'items',                     column: 'sell_price' },
  { table: 'items',                     column: 'store_price' },
  { table: 'order_items',               column: 'unit_price' },
  { table: 'order_items',               column: 'subtotal' },
  { table: 'purchase_order_items',      column: 'unit_price' },
  { table: 'purchase_order_items',      column: 'subtotal' },
  { table: 'payments',                  column: 'amount' },
  { table: 'menu_items',                column: 'sell_price' },
  { table: 'item_price_history',        column: 'old_price' },
  { table: 'item_price_history',        column: 'new_price' },
  { table: 'item_price_history',        column: 'price_diff' },
  { table: 'scheduled_price_changes',   column: 'new_cost_price' },
  { table: 'scheduled_price_changes',   column: 'new_store_price' },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  console.log('🔌 連線\n');
  console.log('📐 Migration: 金額欄位 integer → numeric(10,2)');
  console.log('════════════════════════════════════════\n');

  let altered = 0;
  let alreadyNumeric = 0;

  try {
    await sql.begin(async (tx) => {
      for (const c of COLUMNS) {
        // 查當前型別
        const [info] = await tx`
          SELECT data_type, numeric_precision, numeric_scale
          FROM information_schema.columns
          WHERE table_name = ${c.table} AND column_name = ${c.column}
        ` as any;

        if (!info) {
          console.log(`  ⚠️  ${c.table}.${c.column} 不存在，跳過`);
          continue;
        }

        if (info.data_type === 'numeric' && info.numeric_precision === 10 && info.numeric_scale === 2) {
          console.log(`  ⏭️  ${c.table}.${c.column} 已是 numeric(10,2)`);
          alreadyNumeric++;
          continue;
        }

        // ALTER（無損轉換）
        await tx.unsafe(`
          ALTER TABLE "${c.table}"
          ALTER COLUMN "${c.column}" TYPE numeric(10,2)
            USING "${c.column}"::numeric(10,2)
        `);

        // 確認 default 仍對（integer 0 → numeric 0 自動轉，但保險再 SET 一次）
        if (c.column !== 'new_store_price' && c.column !== 'old_price' && c.column !== 'new_price' && c.column !== 'price_diff' && c.column !== 'new_cost_price') {
          // 只對有 default 0 的欄位 SET DEFAULT
          await tx.unsafe(`
            ALTER TABLE "${c.table}"
            ALTER COLUMN "${c.column}" SET DEFAULT 0
          `);
        }

        console.log(`  ✅ ${c.table}.${c.column} integer → numeric(10,2)`);
        altered++;
      }
    });
  } catch (e) {
    console.error('\n❌ Transaction rollback：', e);
    await sql.end();
    process.exit(1);
  }

  // 驗證
  console.log('\n📊 結果驗證');
  console.log('────────────────────────────────────────');
  const verify = await sql`
    SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE (table_name, column_name) IN (
      ('items', 'cost_price'), ('items', 'sell_price'), ('items', 'store_price'),
      ('order_items', 'unit_price'), ('order_items', 'subtotal'),
      ('purchase_order_items', 'unit_price'), ('purchase_order_items', 'subtotal'),
      ('payments', 'amount'),
      ('menu_items', 'sell_price'),
      ('item_price_history', 'old_price'), ('item_price_history', 'new_price'), ('item_price_history', 'price_diff'),
      ('scheduled_price_changes', 'new_cost_price'), ('scheduled_price_changes', 'new_store_price')
    )
    ORDER BY table_name, column_name
  `;
  for (const r of verify) {
    const ok = r.data_type === 'numeric' && r.numeric_precision === 10 && r.numeric_scale === 2 ? '✅' : '❌';
    console.log(`  ${ok} ${r.table_name}.${r.column_name}: ${r.data_type}(${r.numeric_precision},${r.numeric_scale})`);
  }

  console.log('\n════════════════════════════════════════');
  console.log(`🎉 完成 — ${altered} 改 / ${alreadyNumeric} 已是 numeric`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
