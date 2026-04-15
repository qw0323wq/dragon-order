/**
 * 合併 漁鴻海產(#52) → 瑞濱海產(#4)
 *
 * 緣由：兩家是同一老闆不同抬頭的公司
 *   - 瑞濱海產有限公司（統編 83792669）= 應稅公司，主用
 *   - 漁鴻海產有限公司（統編 89606797）= 免稅公司，備註保留
 *
 * 動作（單一 transaction）：
 *   1. 更新 #4 瑞濱：name「瑞濱海鮮」→「瑞濱海產」+ 完整商務資訊（含應稅銀行）
 *      notes 加上漁鴻備註（同公司不同抬頭）
 *   2. 13 個漁鴻新品（#347~#359）supplier_id 從 52 改 4
 *   3. 8 個瑞濱舊品停用 is_active=false（早期錯誤資料，價格與規格不對）
 *   4. 刪除 #52 漁鴻 supplier（品項已搬空）
 *
 * 品名「（漁鴻）」後綴保留不動（Terry 沒指示要改）— 員工看「白蝦41/50（漁鴻）」
 * 仍知道是漁鴻牌的，改名涉及 alias 等較大工作量另議。
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const RUIBIN_ID = 4;
const YUHONG_ID = 52;

const RUIBIN_UPDATE = {
  name: '瑞濱海產',
  companyName: '瑞濱海產有限公司',
  taxId: '83792669',
  contact: '葉庭均',
  phone: '02-2298-0522',
  address: '新北市五股區五權路14號2樓',
  paymentType: '月結',
  leadDays: 1,
  orderCutoff: '22:00',
  orderDays: [1, 2, 3, 4, 5], // 平日（沿用漁鴻資訊）
  minOrderAmount: 2000,
  freeShippingMin: 2000,
  bankAccount: '第一銀行 松山分行 151-10-070827 戶名：瑞濱海產有限公司',
  notes: [
    '海鮮+部分火鍋料 / 應稅公司',
    '配送：週一~五，22:00 截止隔日配，滿 $2000 免運，月結',
    '',
    '【免稅發票備註 — 同公司不同抬頭】',
    '漁鴻海產有限公司（統編 89606797）',
    '地址：新北市新莊區福慧路206號5樓-206',
    '業務：黃國哲 0905-791-367 / LINE 同手機',
    '玉山銀行 (代碼 808) 五股分行 0543-940-008177 戶名：漁鴻海產有限公司',
    '※ 開免稅發票時用此抬頭',
  ].join('\n'),
};

// 8 個瑞濱舊品 — 早期錯誤資料，停用
const DEACTIVATE_OLD_RUIBIN_IDS = [25, 26, 27, 28, 29, 52, 53, 62, 63];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    types: { numeric: { to: 1700, from: [1700], parse: parseFloat, serialize: String } } as any,
  });

  console.log('🔌 連線\n');

  let updated = 0;
  let reassigned = 0;
  let deactivated = 0;

  try {
    await sql.begin(async (tx) => {
      // ── 1. 更新瑞濱 #4 ──
      console.log('🏢 [1/4] 更新 #4 瑞濱海產商務資訊（應稅 + 漁鴻備註）');
      await tx`
        UPDATE suppliers SET
          name = ${RUIBIN_UPDATE.name},
          company_name = ${RUIBIN_UPDATE.companyName},
          tax_id = ${RUIBIN_UPDATE.taxId},
          contact = ${RUIBIN_UPDATE.contact},
          phone = ${RUIBIN_UPDATE.phone},
          address = ${RUIBIN_UPDATE.address},
          payment_type = ${RUIBIN_UPDATE.paymentType},
          lead_days = ${RUIBIN_UPDATE.leadDays},
          order_cutoff = ${RUIBIN_UPDATE.orderCutoff},
          order_days = ${RUIBIN_UPDATE.orderDays as unknown as number[]},
          min_order_amount = ${RUIBIN_UPDATE.minOrderAmount},
          free_shipping_min = ${RUIBIN_UPDATE.freeShippingMin},
          bank_account = ${RUIBIN_UPDATE.bankAccount},
          notes = ${RUIBIN_UPDATE.notes}
        WHERE id = ${RUIBIN_ID}
      `;
      console.log('   ✅ 瑞濱海鮮 → 瑞濱海產，含應稅銀行 + 漁鴻備註');
      updated++;

      // ── 2. 13 個漁鴻品項 reassign supplier ──
      console.log('\n🔄 [2/4] 漁鴻品項 supplier_id 52 → 4');
      const items = await tx`
        SELECT id, sku, name FROM items WHERE supplier_id = ${YUHONG_ID} ORDER BY sku
      `;
      for (const it of items) {
        await tx`UPDATE items SET supplier_id = ${RUIBIN_ID} WHERE id = ${it.id}`;
        console.log(`   ✅ #${String(it.id).padEnd(4)} ${it.sku} ${it.name}`);
        reassigned++;
      }

      // ── 3. 停用 8 個瑞濱舊錯誤品項 ──
      console.log('\n🚫 [3/4] 停用瑞濱舊錯誤品項（價格規格錯）');
      for (const id of DEACTIVATE_OLD_RUIBIN_IDS) {
        const [item] = await tx`SELECT name, sku, is_active FROM items WHERE id = ${id}` as any;
        if (!item) {
          console.log(`   ⚠️  #${id} 找不到，跳過`);
          continue;
        }
        if (!item.is_active) {
          console.log(`   ⏭️  #${id} ${item.name} 已是停用`);
          continue;
        }
        await tx`UPDATE items SET is_active = false WHERE id = ${id}`;
        console.log(`   ✅ #${id} ${item.sku} ${item.name} 停用`);
        deactivated++;
      }

      // ── 4. 刪除 #52 漁鴻 supplier ──
      console.log('\n🗑️  [4/4] 刪除 #52 漁鴻 supplier');
      const remaining = await tx`SELECT COUNT(*) as cnt FROM items WHERE supplier_id = ${YUHONG_ID}`;
      if (Number(remaining[0].cnt) > 0) {
        throw new Error(`#52 仍有 ${remaining[0].cnt} 個品項未搬離，無法刪除`);
      }
      await tx`DELETE FROM suppliers WHERE id = ${YUHONG_ID}`;
      console.log('   ✅ #52 漁鴻 supplier 已刪除（SF-04 code 釋放）');
    });
  } catch (e) {
    console.error('\n❌ Transaction rollback：', e);
    await sql.end();
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════');
  console.log('🎉 合併完成');
  console.log('════════════════════════════════════════');
  console.log(`  瑞濱更新：${updated} 筆`);
  console.log(`  品項搬遷：${reassigned} 筆 (#52 → #4)`);
  console.log(`  舊品停用：${deactivated} 筆`);
  console.log(`  漁鴻 #52 supplier：已刪除`);
  console.log('');
  console.log('  📌 後續：員工叫貨頁顯示「瑞濱海產」13 個品項');
  console.log('     開應稅發票用瑞濱，開免稅用漁鴻（資訊在 notes）');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
