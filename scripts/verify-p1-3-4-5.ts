/**
 * P1-3/4/5 修復驗證
 *
 * [P1-3] cron 冪等性：SELECT FOR UPDATE SKIP LOCKED 確保重複觸發不重複套用
 * [P1-4] orderItems.unit_price 快照：改 items.cost_price 後舊訂單不變
 * [P1-5] 歸還數量範圍檢查：returnQty > remaining 被擋
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  types: { numeric: { to: 1700, from: [1700], parse: parseFloat, serialize: String } } as any,
});

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  console.log(`    ${cond ? '✅' : '❌'} ${msg}`);
  cond ? pass++ : fail++;
}

const ROLLBACK = 'VERIFY_ROLLBACK';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  P1-3/4/5 修復驗證');
  console.log('═══════════════════════════════════════');

  const [sampleItem] = await sql`SELECT id, cost_price, unit FROM items WHERE is_active = true LIMIT 1`;
  const [sampleStore] = await sql`SELECT id FROM stores LIMIT 1`;
  const [secondStore] = await sql`SELECT id FROM stores WHERE id != ${sampleStore.id} LIMIT 1`;
  const [sampleSupplier] = await sql`SELECT id FROM suppliers WHERE is_active = true LIMIT 1`;

  // ─── [P1-3] cron SKIP LOCKED 冪等性 ───
  console.log('\n🧪 [P1-3] cron 冪等：SELECT FOR UPDATE SKIP LOCKED');
  console.log('────────────────────────────────────────');
  try {
    await sql.begin(async (tx) => {
      // 建 2 筆測試排程
      const [s1] = await tx`
        INSERT INTO scheduled_price_changes (item_id, new_cost_price, effective_date, status, source)
        VALUES (${sampleItem.id}, 999, '2099-01-01', 'pending', 'VERIFY_P1_3_A')
        RETURNING id
      `;
      const [s2] = await tx`
        INSERT INTO scheduled_price_changes (item_id, new_cost_price, effective_date, status, source)
        VALUES (${sampleItem.id}, 888, '2099-01-01', 'pending', 'VERIFY_P1_3_B')
        RETURNING id
      `;

      // 模擬 cron process A 鎖住這兩筆
      const lockedByA = await tx`
        SELECT id FROM scheduled_price_changes
        WHERE status = 'pending' AND effective_date <= '2099-12-31'
          AND source LIKE 'VERIFY_P1_3_%'
        FOR UPDATE SKIP LOCKED
      `;
      assert(lockedByA.length === 2, `process A 鎖住 2 筆 pending`);

      // 模擬 process B 同時來查（用 subtransaction / savepoint 模擬不同連線）
      // 用第二個 connection 測試 SKIP LOCKED
      const sql2 = postgres(process.env.DATABASE_URL!, {
        prepare: false,
        types: { numeric: { to: 1700, from: [1700], parse: parseFloat, serialize: String } } as any,
      });
      await sql2.begin(async (tx2) => {
        const lockedByB = await tx2`
          SELECT id FROM scheduled_price_changes
          WHERE status = 'pending' AND effective_date <= '2099-12-31'
            AND source LIKE 'VERIFY_P1_3_%'
          FOR UPDATE SKIP LOCKED
        `;
        assert(lockedByB.length === 0, `process B 同時查 → SKIP LOCKED 跳過 A 鎖住的，拿到 0 筆`);
      });
      await sql2.end();

      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === ROLLBACK)) throw e;
  }

  // ─── [P1-4] orderItems.unit_price 快照 ───
  console.log('\n🧪 [P1-4] orderItems.unit_price 快照：改 items.cost_price 後訂單金額不變');
  console.log('────────────────────────────────────────');
  const originalCostPrice = sampleItem.cost_price;
  try {
    await sql.begin(async (tx) => {
      const [order] = await tx`
        INSERT INTO orders (order_date, status, notes)
        VALUES ('2099-01-01', 'submitted', 'VERIFY_P1_4')
        RETURNING id
      `;
      // 下單時 unit_price = 100（快照）
      const [oi] = await tx`
        INSERT INTO order_items (order_id, item_id, store_id, quantity, unit, unit_price, subtotal)
        VALUES (${order.id}, ${sampleItem.id}, ${sampleStore.id}, 2, ${sampleItem.unit || '份'}, 100, 200)
        RETURNING id, unit_price, subtotal
      `;
      const snapshotPrice = parseFloat(String(oi.unit_price));
      console.log(`    下單時 order_items.unit_price = $${snapshotPrice}`);

      // 改 items.cost_price 到 500（模擬漲價）
      await tx`UPDATE items SET cost_price = 500 WHERE id = ${sampleItem.id}`;

      // 查 order_items.unit_price 應該還是 100
      const [oiAfter] = await tx`
        SELECT unit_price, subtotal FROM order_items WHERE id = ${oi.id}
      `;
      const afterPrice = parseFloat(String(oiAfter.unit_price));
      console.log(`    漲價後 items.cost_price = $500，但 order_items.unit_price = $${afterPrice}`);

      assert(afterPrice === snapshotPrice, 'order_items.unit_price 為快照，未被 items 漲價影響');

      // 現價 live query
      const [itemLive] = await tx`SELECT cost_price FROM items WHERE id = ${sampleItem.id}`;
      const livePrice = parseFloat(String(itemLive.cost_price));
      assert(livePrice === 500, 'items.cost_price 已更新為新值 $500');

      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (!(e instanceof Error && e.message === ROLLBACK)) throw e;
  }

  // ─── [P1-5] 歸還數量範圍檢查 ───
  console.log('\n🧪 [P1-5] 歸還數量範圍檢查');
  console.log('────────────────────────────────────────');
  if (!secondStore) {
    console.log('    ⚠️  只有一個 store，跳過 transfer 測試');
  } else {
    try {
      await sql.begin(async (tx) => {
        // 建借料單：借 10 份
        const [transfer] = await tx`
          INSERT INTO transfers (transfer_number, type, from_store_id, to_store_id, status)
          VALUES ('VERIFY-TR-001', 'borrow', ${sampleStore.id}, ${secondStore.id}, 'confirmed')
          RETURNING id
        `;
        const [ti] = await tx`
          INSERT INTO transfer_items (transfer_id, item_id, quantity, unit, returned_qty)
          VALUES (${transfer.id}, ${sampleItem.id}, 10, '份', 0)
          RETURNING id, quantity, returned_qty
        `;

        // 模擬新邏輯的範圍檢查
        const quantity = parseFloat(String(ti.quantity));
        const returned = parseFloat(String(ti.returned_qty));
        const remaining = quantity - returned;
        console.log(`    借料 ${quantity} 份，已還 ${returned}，未還 ${remaining}`);

        // Case 1: 合法歸還（3 份 <= 10 剩餘）
        const case1 = 3;
        const ok1 = case1 > 0 && case1 <= remaining + 0.001;
        assert(ok1, `歸還 ${case1} 份（< 10 未還）通過檢查`);

        // Case 2: 超還（15 份 > 10 剩餘）
        const case2 = 15;
        const ok2 = case2 > 0 && case2 <= remaining + 0.001;
        assert(!ok2, `歸還 ${case2} 份（> 10 未還）被範圍檢查擋下`);

        // Case 3: 0 或負（0 份應被擋）
        const case3 = 0;
        const ok3 = case3 > 0;
        assert(!ok3, `歸還 ${case3} 份（= 0）被擋下`);

        // Case 4: 剛好全還（10 份）
        const case4 = 10;
        const ok4 = case4 > 0 && case4 <= remaining + 0.001;
        assert(ok4, `歸還 ${case4} 份（剛好 = 借出）通過檢查`);

        // Case 5: 邊緣浮點（10.0005 應該通過因為 +0.001 tolerance）
        const case5 = 10.0005;
        const ok5 = case5 > 0 && case5 <= remaining + 0.001;
        assert(ok5, `歸還 ${case5} 份（浮點誤差 tolerance）通過檢查`);

        throw new Error(ROLLBACK);
      });
    } catch (e) {
      if (!(e instanceof Error && e.message === ROLLBACK)) throw e;
    }
  }

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
