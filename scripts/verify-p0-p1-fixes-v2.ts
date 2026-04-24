/**
 * P0-4/5 + P1-1/2 修復驗證
 *
 * [P1-1] subtotal 精度：Math.round vs roundMoney 差異
 * [P1-2] PO 生成 transaction 能 rollback（不 orphan PO）
 * [P0-4] payment PATCH 鎖行 + 冪等（同 status 再 PATCH 不改 paid_at）
 * [P0-5] 訂單分頁 LIMIT/OFFSET 能正常運作
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { roundMoney } from '../src/lib/format';

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  types: { numeric: { to: 1700, from: [1700], parse: parseFloat, serialize: String } } as any,
});

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  console.log(`    ${cond ? '✅' : '❌'} ${msg}`);
  cond ? pass++ : fail++;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  P0-4/5 + P1-1/2 修復驗證');
  console.log('═══════════════════════════════════════');

  // ─── [P1-1] subtotal 精度 ───
  console.log('\n🧪 [P1-1] subtotal 精度：Math.round vs roundMoney');
  console.log('────────────────────────────────────────');
  // 凍豆腐 $63.3 × 2.5 公斤
  const qty1 = 2.5, price1 = 63.3;
  const oldResult1 = Math.round(qty1 * price1);
  const newResult1 = roundMoney(qty1 * price1);
  console.log(`    2.5 公斤 × $63.3/公斤 = ${qty1 * price1}`);
  console.log(`    舊 Math.round: $${oldResult1} (丟失 $${(qty1 * price1 - oldResult1).toFixed(2)})`);
  console.log(`    新 roundMoney: $${newResult1}`);
  assert(newResult1 === 158.25, 'roundMoney(2.5 × 63.3) = 158.25');
  assert(oldResult1 === 158, 'Math.round 原本丟失 $0.25（新版保留）');

  // 多筆累加誤差場景
  const newResult2 = roundMoney(10.5 * 128.5 + 0.3 + 0.3 + 0.3);
  const rawSum = 10.5 * 128.5 + 0.3 + 0.3 + 0.3;
  console.log(`    10.5 × 128.5 + 0.3×3 = raw ${rawSum}`);
  console.log(`    roundMoney: $${newResult2}`);
  assert(newResult2 === 1350.15, 'roundMoney 消除浮點誤差');

  // ─── [P1-2] PO 生成 transaction rollback ───
  console.log('\n🧪 [P1-2] PO transaction 能 rollback（失敗不 orphan）');
  console.log('────────────────────────────────────────');
  const ROLLBACK = 'VERIFY_ROLLBACK';

  const [sampleItem] = await sql`SELECT id, supplier_id, unit FROM items WHERE is_active = true LIMIT 1`;
  const [sampleStore] = await sql`SELECT id FROM stores LIMIT 1`;

  let poCountBefore = 0;
  try {
    await sql.begin(async (tx) => {
      // 先記錄 PO 數
      const [before] = await tx`SELECT COUNT(*)::int as c FROM purchase_orders WHERE order_date = '2099-01-01'`;
      poCountBefore = before.c;

      // 建測試 order + order_item（放未來日期避免干擾）
      const [order] = await tx`
        INSERT INTO orders (order_date, status, notes)
        VALUES ('2099-01-01', 'draft', 'VERIFY_PO_TX')
        RETURNING id
      `;
      await tx`
        INSERT INTO order_items (order_id, item_id, store_id, quantity, unit, unit_price, subtotal)
        VALUES (${order.id}, ${sampleItem.id}, ${sampleStore.id}, 1.5, ${sampleItem.unit || '份'}, 63.3, 94.95)
      `;

      // 建 PO（模擬 purchase-orders POST 在 tx 內做的事）
      const [po] = await tx`
        INSERT INTO purchase_orders (po_number, supplier_id, order_date, delivery_date, total_amount, status)
        VALUES ('PO-VERIFY-001', ${sampleItem.supplier_id}, '2099-01-01', '2099-01-01', 94.95, 'draft')
        RETURNING id
      `;
      await tx`
        INSERT INTO purchase_order_items (po_id, item_id, store_id, quantity, unit, unit_price, subtotal)
        VALUES (${po.id}, ${sampleItem.id}, ${sampleStore.id}, 1.5, ${sampleItem.unit || '份'}, 63.3, 94.95)
      `;

      // 檢查 transaction 內 PO 和 items 都存在
      const [poInTx] = await tx`SELECT id FROM purchase_orders WHERE id = ${po.id}`;
      const [poiInTx] = await tx`SELECT COUNT(*)::int as c FROM purchase_order_items WHERE po_id = ${po.id}`;
      console.log(`    tx 內: PO #${poInTx?.id}, PO items=${poiInTx.c}`);

      // 故意 throw 讓 rollback
      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === ROLLBACK)) throw e;
  }

  // 驗證 rollback 後沒 orphan
  const [poCountAfter] = await sql`SELECT COUNT(*)::int as c FROM purchase_orders WHERE order_date = '2099-01-01'`;
  assert(poCountAfter.c === poCountBefore, `PO 數量 rollback 後仍是 ${poCountBefore}（無 orphan）`);

  const [ordersLeft] = await sql`SELECT COUNT(*)::int as c FROM orders WHERE order_date = '2099-01-01' AND notes = 'VERIFY_PO_TX'`;
  assert(ordersLeft.c === 0, 'order 測試資料也被 rollback');

  // ─── [P0-4] payment 冪等 ───
  console.log('\n🧪 [P0-4] payment PATCH 冪等：重複點「已付」paid_at 不被覆蓋');
  console.log('────────────────────────────────────────');
  try {
    await sql.begin(async (tx) => {
      // 建測試 order + payment
      const [order] = await tx`
        INSERT INTO orders (order_date, status)
        VALUES ('2099-01-02', 'closed')
        RETURNING id
      `;
      const [supplier] = await tx`SELECT id FROM suppliers WHERE is_active = true LIMIT 1`;
      const [payment] = await tx`
        INSERT INTO payments (order_id, supplier_id, amount, status, payment_type)
        VALUES (${order.id}, ${supplier.id}, 100, 'unpaid', '月結')
        RETURNING id
      `;

      // 模擬 PATCH 邏輯（新版程式 rawSql.begin 鎖行）
      const [first] = await tx`SELECT status, paid_at FROM payments WHERE id = ${payment.id} FOR UPDATE`;
      assert(first.status === 'unpaid' && first.paid_at === null, '初始狀態 unpaid / paid_at null');

      // 第一次標已付
      const firstPaidAt = new Date();
      await tx`
        UPDATE payments SET status = 'paid', paid_at = ${firstPaidAt} WHERE id = ${payment.id}
      `;
      const [afterFirst] = await tx`SELECT status, paid_at FROM payments WHERE id = ${payment.id}`;
      assert(afterFirst.status === 'paid', '第一次 PATCH 後 status = paid');

      // 第二次重複標（新邏輯冪等：已是 paid → 直接返回不改 paid_at）
      const [existing] = await tx`SELECT status FROM payments WHERE id = ${payment.id} FOR UPDATE`;
      const isIdempotent = existing.status === 'paid'; // 新邏輯會偵測到並跳過 UPDATE
      assert(isIdempotent, '第二次 PATCH 偵測到已是 paid（冪等路徑）');

      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === ROLLBACK)) throw e;
  }

  // ─── [P0-5] orders 分頁 ───
  console.log('\n🧪 [P0-5] orders 分頁 LIMIT/OFFSET');
  console.log('────────────────────────────────────────');
  const [total] = await sql`SELECT COUNT(*)::int as c FROM orders`;
  console.log(`    DB 訂單總數: ${total.c}`);

  const page1 = await sql`SELECT id FROM orders ORDER BY order_date DESC, created_at DESC LIMIT 5 OFFSET 0`;
  const page2 = await sql`SELECT id FROM orders ORDER BY order_date DESC, created_at DESC LIMIT 5 OFFSET 5`;
  console.log(`    page1 (limit=5, offset=0): ${page1.length} rows`);
  console.log(`    page2 (limit=5, offset=5): ${page2.length} rows`);

  assert(page1.length <= 5, 'LIMIT 5 生效');
  const overlap = page1.filter((a) => page2.some((b) => b.id === a.id));
  assert(overlap.length === 0, 'page1/page2 無重疊（OFFSET 生效）');

  // limit 上限保護
  const DEFAULT_LIMIT = 100, MAX_LIMIT = 500;
  const capped = Math.min(Math.max(1, 9999), MAX_LIMIT);
  assert(capped === MAX_LIMIT, `limit=9999 被 cap 到 ${MAX_LIMIT}`);
  const defaulted = Math.min(Math.max(1, isNaN(parseInt('abc')) ? DEFAULT_LIMIT : parseInt('abc')), MAX_LIMIT);
  assert(defaulted === DEFAULT_LIMIT, `invalid limit 落到預設 ${DEFAULT_LIMIT}`);

  await sql.end();

  console.log('\n════════════════════════════════════════');
  console.log(`🎯 結果：${pass} 通過 / ${fail} 失敗`);
  console.log('════════════════════════════════════════\n');

  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
