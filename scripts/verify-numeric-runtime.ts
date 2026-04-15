/**
 * 驗證 numeric types parser 是否正確生效
 *   - 跟 production lib/db/index.ts 用一模一樣的 postgres config
 *   - 確認 raw query 回 number 而非 string
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { sumBy } from '../src/lib/format';

// === 跟 lib/db/index.ts 相同的 config ===
const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  types: {
    numeric: {
      to: 1700,
      from: [1700],
      parse: (value: string) => parseFloat(value),
      serialize: (value: number) => String(value),
    },
  },
});

async function main() {
  console.log('═══════════════════════════════════════\n  numeric types parser 驗證\n═══════════════════════════════════════\n');

  let pass = 0, fail = 0;

  // 1. 凍豆腐 cost_price
  const r1 = await sql`SELECT cost_price FROM items WHERE id = 358`;
  console.log(`[1] 凍豆腐 cost_price = ${r1[0].cost_price} (${typeof r1[0].cost_price})`);
  typeof r1[0].cost_price === 'number' ? (pass++, console.log('    ✅')) : (fail++, console.log('    ❌'));

  // 2. order_items.subtotal
  const r2 = await sql`SELECT subtotal, unit_price FROM order_items LIMIT 5`;
  if (r2.length > 0) {
    console.log(`[2] order_items 5 筆 subtotal type 檢查:`);
    let ok = true;
    for (const r of r2) {
      const t = typeof r.subtotal;
      if (t !== 'number') { ok = false; console.log(`    ❌ subtotal=${r.subtotal} (${t})`); }
    }
    if (ok) {
      pass++;
      console.log(`    ✅ 全部都是 number type`);
    } else fail++;
  }

  // 3. payments.amount
  const r3 = await sql`SELECT amount FROM payments LIMIT 3`;
  if (r3.length > 0) {
    console.log(`[3] payments amount: ${r3.map(r => `${r.amount}(${typeof r.amount})`).join(', ')}`);
    typeof r3[0].amount === 'number' ? (pass++, console.log('    ✅')) : (fail++, console.log('    ❌'));
  }

  // 4. SUM aggregate
  const r4 = await sql`SELECT SUM(subtotal) as total FROM order_items`;
  console.log(`[4] SQL SUM = ${r4[0].total} (${typeof r4[0].total})`);
  typeof r4[0].total === 'number' ? (pass++, console.log('    ✅')) : (fail++, console.log('    ❌'));

  // 5. sumBy 對混合小數整數
  const test = sumBy([{x: 63.3}, {x: 290}, {x: 85.5}], i => i.x);
  console.log(`[5] sumBy(63.3 + 290 + 85.5) = ${test} (期望 438.8)`);
  test === 438.8 ? (pass++, console.log('    ✅')) : (fail++, console.log('    ❌'));

  // 6. 浮點誤差
  const test2 = sumBy([{x: 0.1}, {x: 0.2}], i => i.x);
  console.log(`[6] sumBy(0.1 + 0.2) = ${test2} (期望 0.3, 純 reduce 會是 0.30000000000000004)`);
  test2 === 0.3 ? (pass++, console.log('    ✅')) : (fail++, console.log('    ❌'));

  console.log(`\n${'═'.repeat(40)}\n結果：${pass} 通過 / ${fail} 失敗\n${'═'.repeat(40)}`);
  await sql.end();
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
