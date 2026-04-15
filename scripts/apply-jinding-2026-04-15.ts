/**
 * 津鼎報價單整合（單一 transaction）— 2026-04-15 立即生效
 *
 * 1. ALTER suppliers 加 bank_account 欄位（Q1-B）
 * 2. UPDATE 津鼎 #12 完整商務資訊（公司全名/統編/電話/地址/配送規則/銀行）
 * 3. UPDATE 4 筆改價（直接改不走排程，Q4「現在生效」）：
 *    #155 酒釀4斤      $200 → $210
 *    #154 沙拉油18L    $880 → $920
 *    #148 芝麻香油3L   $280 → $315
 *    #163 白飯→白米30kg $1320 → $1450（含改名 + 加 spec 「出雲米」）
 * 4. UPDATE #87 老油條規格改（Q2 第 5 題 B）：
 *    name → '老油條3KG.箱'、unit → '箱'、cost_price → $830
 * 5. INSERT 4 新品（Q2 並存 + Q3 冰糖）：
 *    甲等醬油萬家香 6kg / 雞粉1kg.康寶 / 黑胡椒粉粗#71 / 冰糖1kg.台糖
 * 6. 寫 item_price_history（4 筆純改價 + 老油條 audit）
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const SUPPLIER_ID = 12; // 津鼎 GR-01
const TODAY = '2026-04-15';
const SOURCE = '津鼎報價單 2026-04-15';

const SUPPLIER_UPDATE = {
  name: '津鼎',
  companyName: '津鼎有限公司',
  taxId: '89981202',
  phone: '02-8511-4009',
  address: '新北市三重區新北大道二段45號',
  paymentType: '月結',
  leadDays: 1,
  orderCutoff: '22:00',
  orderDays: [1, 2, 3, 4, 5], // 週一~五
  minOrderAmount: 2000,
  freeShippingMin: 2000,
  notes: '調味料/主食/雜貨 / LINE @465zbabk / 配送週一~五，22:00 截止隔日配，台北滿 $2000 免運',
  bankAccount: '玉山銀行 (代碼 808) 五股分行 0543-940-008177 戶名：津鼎有限公司',
};

const PRICE_UPDATES: { itemId: number; oldPrice: number; newPrice: number; name: string; writeHistory: boolean }[] = [
  { itemId: 155, oldPrice: 200, newPrice: 210, name: '酒釀4斤', writeHistory: true },
  { itemId: 154, oldPrice: 880, newPrice: 920, name: '沙拉油18L', writeHistory: true },
  { itemId: 148, oldPrice: 280, newPrice: 315, name: '芝麻香油3L', writeHistory: true },
  { itemId: 163, oldPrice: 1320, newPrice: 1450, name: '白米30kg (原白飯30kg)', writeHistory: true },
];

// 老油條規格改（不寫 history，因為單位變了，價格比較會誤導）
const OLOTI_UPDATE = {
  itemId: 87,
  newName: '老油條3KG.箱（津鼎）',
  newUnit: '箱',
  newCostPrice: 830,
  newSupplierNotes: '原 $38/條 規格 2026-04-15 改為大箱裝（3kg/箱）配合津鼎報價單',
};

const NEW_ITEMS: {
  prefix: string;
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  aliases: string[];
  supplierNotes: string | null;
}[] = [
  {
    prefix: 'GR', name: '甲等醬油萬家香6kg（津鼎）', category: '雜貨', unit: '桶', costPrice: 215,
    aliases: ['醬油萬家香', '萬家香醬油', '甲等醬油'],
    supplierNotes: '報價單原名：甲等醬油.一般6kg.萬家香 — 跟龜甲萬醬油 $360 並存（便宜款）',
  },
  {
    prefix: 'GR', name: '雞粉1kg.康寶（津鼎）', category: '雜貨', unit: '罐', costPrice: 275,
    aliases: ['雞粉康寶', '康寶雞粉'],
    supplierNotes: '報價單原名：雞粉1kg.罐.康寶牌 — 跟雞粉2.2kg $480 並存（小罐版）',
  },
  {
    prefix: 'GR', name: '黑胡椒粉粗#71.小磨坊（津鼎）600g', category: '雜貨', unit: '包', costPrice: 320,
    aliases: ['黑胡椒粉粗', '黑胡椒粗'],
    supplierNotes: '報價單原名：黑胡椒粉600g.粗#71.小磨坊 — 跟一般黑胡椒粉 $230 並存（粗顆粒款）',
  },
  {
    prefix: 'GR', name: '冰糖1kg.台糖（津鼎）', category: '雜貨', unit: '包', costPrice: 85,
    aliases: ['冰糖', '冰糖1kg'],
    supplierNotes: null,
  },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    types: { numeric: { to: 1700, from: [1700], parse: parseFloat, serialize: String } } as any,
  });

  console.log('🔌 連線\n');

  let priceUpdated = 0;
  let historyWritten = 0;
  let inserted = 0;

  try {
    await sql.begin(async (tx) => {
      // ── 1. ALTER suppliers 加 bank_account ──
      console.log('🏗️  [1/6] Schema migration: suppliers.bank_account');
      const colCheck = await tx`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'suppliers' AND column_name = 'bank_account'
      `;
      if (colCheck.length === 0) {
        await tx.unsafe(`ALTER TABLE suppliers ADD COLUMN bank_account text`);
        console.log('   ✅ 新增 bank_account 欄位');
      } else {
        console.log('   ⏭️  bank_account 欄位已存在');
      }

      // ── 2. 更新津鼎商務資訊 ──
      console.log('\n🏢 [2/6] 更新津鼎 #12 商務資訊');
      await tx`
        UPDATE suppliers SET
          company_name = ${SUPPLIER_UPDATE.companyName},
          tax_id = ${SUPPLIER_UPDATE.taxId},
          phone = ${SUPPLIER_UPDATE.phone},
          address = ${SUPPLIER_UPDATE.address},
          payment_type = ${SUPPLIER_UPDATE.paymentType},
          lead_days = ${SUPPLIER_UPDATE.leadDays},
          order_cutoff = ${SUPPLIER_UPDATE.orderCutoff},
          order_days = ${SUPPLIER_UPDATE.orderDays as unknown as number[]},
          min_order_amount = ${SUPPLIER_UPDATE.minOrderAmount},
          free_shipping_min = ${SUPPLIER_UPDATE.freeShippingMin},
          notes = ${SUPPLIER_UPDATE.notes},
          bank_account = ${SUPPLIER_UPDATE.bankAccount}
        WHERE id = ${SUPPLIER_ID}
      `;
      console.log(`   ✅ 統編/電話/地址/配送規則/銀行 全部寫入`);

      // ── 3. 4 筆純改價（含白米改名）──
      console.log('\n💰 [3/6] 立即改價 (4 筆)');
      for (const u of PRICE_UPDATES) {
        if (u.itemId === 163) {
          // 白飯 → 白米 改名 + 改價
          await tx`
            UPDATE items SET
              name = '白米30kg（津鼎）',
              cost_price = ${u.newPrice},
              spec = '出雲米',
              supplier_notes = '原 DB 名「白飯30kg」係 typo，2026-04-15 改正為「白米30kg」並更新出雲米品牌價'
            WHERE id = ${u.itemId}
          `;
          console.log(`   ✅ #${u.itemId} ${u.name} $${u.oldPrice}→$${u.newPrice} + 改名 + spec=出雲米`);
        } else {
          await tx`UPDATE items SET cost_price = ${u.newPrice} WHERE id = ${u.itemId}`;
          console.log(`   ✅ #${u.itemId} ${u.name} $${u.oldPrice}→$${u.newPrice}`);
        }
        priceUpdated++;

        // 寫 history
        if (u.writeHistory) {
          const diff = u.newPrice - u.oldPrice;
          const pct = u.oldPrice > 0 ? ((diff / u.oldPrice) * 100).toFixed(2) : '0';
          await tx`
            INSERT INTO item_price_history
              (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
            VALUES
              (${u.itemId}, ${u.oldPrice}, ${u.newPrice}, ${diff}, ${pct}, '元', ${TODAY}, ${SOURCE})
          `;
          historyWritten++;
        }
      }

      // ── 4. 老油條規格改 ──
      console.log('\n🔧 [4/6] 老油條規格替換 (Q2-5 B)');
      await tx`
        UPDATE items SET
          name = ${OLOTI_UPDATE.newName},
          unit = ${OLOTI_UPDATE.newUnit},
          cost_price = ${OLOTI_UPDATE.newCostPrice},
          supplier_notes = ${OLOTI_UPDATE.newSupplierNotes}
        WHERE id = ${OLOTI_UPDATE.itemId}
      `;
      console.log(`   ✅ #${OLOTI_UPDATE.itemId} 老油條 → ${OLOTI_UPDATE.newName} ($${OLOTI_UPDATE.newCostPrice}/${OLOTI_UPDATE.newUnit})`);

      // ── 5. 新建 4 個品項（動態 SKU）──
      console.log('\n🆕 [5/6] 新建 4 個品項');
      const usedByPrefix: Record<string, number> = {};
      for (const it of NEW_ITEMS) {
        if (!(it.prefix in usedByPrefix)) {
          const rows = await tx`
            SELECT sku FROM items
            WHERE sku ~ ${'^' + it.prefix + '-[0-9]+$'}
            ORDER BY sku DESC LIMIT 1
          `;
          let next = 1;
          if (rows.length > 0) {
            const m = String(rows[0].sku).match(/-(\d+)$/);
            if (m) next = parseInt(m[1], 10) + 1;
          }
          usedByPrefix[it.prefix] = next;
        }

        let sku = `${it.prefix}-${String(usedByPrefix[it.prefix]).padStart(3, '0')}`;
        while (true) {
          const dup = await tx`SELECT id FROM items WHERE sku = ${sku}`;
          if (dup.length === 0) break;
          usedByPrefix[it.prefix]++;
          sku = `${it.prefix}-${String(usedByPrefix[it.prefix]).padStart(3, '0')}`;
        }
        usedByPrefix[it.prefix]++;

        const [row] = await tx`
          INSERT INTO items
            (sku, name, category, unit, cost_price, sell_price, supplier_id,
             aliases, supplier_notes, is_active)
          VALUES
            (${sku}, ${it.name}, ${it.category}, ${it.unit}, ${it.costPrice}, 0,
             ${SUPPLIER_ID}, ${it.aliases}, ${it.supplierNotes}, true)
          RETURNING id
        `;
        console.log(`   ✅ #${String(row.id).padEnd(4)} | ${sku} | ${it.name} | ${it.unit} | $${it.costPrice}`);
        inserted++;
      }

      // ── 6. summary ──
      console.log('\n📊 [6/6] 摘要');
      console.log(`   改價：${priceUpdated} 筆 / history 寫入：${historyWritten} 筆`);
      console.log(`   規格替換：1 筆（老油條）`);
      console.log(`   新建：${inserted} 筆`);
    });
  } catch (e) {
    console.error('\n❌ Transaction rollback：', e);
    await sql.end();
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════');
  console.log('🎉 完成 — 立即生效（不走排程）');
  console.log('════════════════════════════════════════\n');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
