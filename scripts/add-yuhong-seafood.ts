/**
 * 新增供應商：漁鴻海產有限公司（SF-04）+ 13 個品項
 *
 * 來源：~/Desktop/鴻廷肥龍火鍋報價單0415.xlsx
 *
 * 動作（單一 transaction）：
 *   1. 新建供應商 漁鴻海產（SF-04）+ 全套商務資訊
 *   2. 新建 13 個品項，全加「（漁鴻）」後綴 + aliases
 *   3. 品名清掉怪後綴（~~~@@發 / ~~~@@@），原報價單名存 supplier_notes
 *   4. 凍豆腐 $63.3 四捨五入 $63（DB cost_price 是 integer）
 *
 * 冪等：供應商 / SKU 已存在會跳過
 *
 * 公休日 (no_delivery_days) 暫不填，notes 寫「依公司行事曆」，等 Terry 提供具體日期
 *
 * 使用：npx tsx scripts/add-yuhong-seafood.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const SUPPLIER = {
  name: '漁鴻海產',
  code: 'SF-04',
  category: '海鮮',
  contact: '黃國哲',
  phone: '0905-791-367',
  companyName: '漁鴻海產有限公司',
  taxId: '89606797',
  address: '新北市新莊區福慧路206號5樓-206',
  paymentType: '月結',
  leadDays: 1,
  orderCutoff: '22:00',
  minOrderAmount: 2000,
  freeShippingMin: 2000,
  notes: '業務 黃國哲 / LINE 同手機 / 傳真 (02)2299-1755 / 月結匯款 / 公休依公司行事曆（週日基本休 + 春節 + 國定假日）',
};

type NewItem = {
  prefix: string;     // SKU 前綴 (SF/BN/HP 等)
  name: string;        // 清乾淨後的品名 (含「（漁鴻）」)
  category: string;
  unit: string;
  costPrice: number;
  aliases: string[];
  supplierNotes: string | null;  // 報價單原名（如有怪後綴）
};

// 13 個品項依 Excel 順序
const NEW_ITEMS: NewItem[] = [
  {
    prefix: 'SF', name: '白蝦41/50-12大盒（漁鴻）', category: '海鮮', unit: '盒', costPrice: 290,
    aliases: ['白蝦', '白蝦41/50'], supplierNotes: null,
  },
  {
    prefix: 'SF', name: '海鱸魚肉-3/4（漁鴻）', category: '海鮮', unit: '公斤', costPrice: 300,
    aliases: ['海鱸魚肉', '海鱸魚'], supplierNotes: null,
  },
  {
    prefix: 'SF', name: '白帶魚卷（漁鴻）', category: '海鮮', unit: '包', costPrice: 105,
    aliases: ['白帶魚'], supplierNotes: null,
  },
  {
    prefix: 'SF', name: '巴沙魚肉-3P.40（漁鴻）', category: '海鮮', unit: '公斤', costPrice: 90,
    aliases: ['巴沙魚肉'], supplierNotes: null,
  },
  {
    prefix: 'SF', name: '刻花魷魚（漁鴻）', category: '海鮮', unit: '公斤', costPrice: 180,
    aliases: ['刻花魷魚'], supplierNotes: '報價單原名：刻花魷魚~~~@@發',
  },
  {
    prefix: 'SF', name: '脆管（漁鴻）', category: '海鮮', unit: '公斤', costPrice: 220,
    aliases: ['脆管'], supplierNotes: '報價單原名：脆管~~~@@發',
  },
  {
    prefix: 'BN', name: '百葉豆腐（漁鴻）', category: '豆製品', unit: '公斤', costPrice: 100,
    aliases: ['百葉豆腐'], supplierNotes: '報價單原名：百葉豆腐~~~@@@',
  },
  {
    prefix: 'SF', name: '花膠A（漁鴻）', category: '海鮮', unit: '公斤', costPrice: 330,
    aliases: ['花膠', '花膠A'], supplierNotes: '報價單原名：花膠A~~~@@發',
  },
  {
    prefix: 'HP', name: '魚餃·三記（漁鴻）', category: '火鍋料', unit: '盒', costPrice: 75,
    aliases: ['魚餃'], supplierNotes: null,
  },
  {
    prefix: 'HP', name: '蝦餃·三記（漁鴻）', category: '火鍋料', unit: '盒', costPrice: 85,
    aliases: ['蝦餃'], supplierNotes: null,
  },
  {
    prefix: 'HP', name: '手工蛋餃·超（漁鴻）', category: '火鍋料', unit: '盒', costPrice: 55,
    aliases: ['手工蛋餃', '蛋餃'], supplierNotes: null,
  },
  {
    prefix: 'BN', name: '凍豆腐（漁鴻）', category: '豆製品', unit: '公斤', costPrice: 63, // 63.3 四捨五入
    aliases: ['凍豆腐'], supplierNotes: '報價單實際單價：$63.3/公斤（DB integer 取 $63）',
  },
  {
    prefix: 'SF', name: '明太子醬-500g利（漁鴻）', category: '海鮮', unit: '包', costPrice: 480,
    aliases: ['明太子醬', '明太子醬-500g'], supplierNotes: null,
  },
];

/** 在 prefix 之下找下個可用 SKU 編號，由 003 開始補（已用最大 +1） */
async function nextSku(tx: any, prefix: string): Promise<string> {
  const rows = await tx`
    SELECT sku FROM items
    WHERE sku ~ ${'^' + prefix + '-[0-9]+$'}
    ORDER BY sku DESC LIMIT 1
  `;
  let next = 1;
  if (rows.length > 0) {
    const m = String(rows[0].sku).match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  console.log('🔌 連線\n');

  let supplierId: number;
  let supplierCreated = false;
  const skuMap: Record<string, string> = {};

  try {
    await sql.begin(async (tx) => {
      // 1. 供應商
      console.log('🏢 [1/2] 供應商 漁鴻海產');
      console.log('────────────────────────────────────────');

      const existing = await tx`SELECT id FROM suppliers WHERE code = ${SUPPLIER.code}`;
      if (existing.length > 0) {
        supplierId = existing[0].id;
        console.log(`   ⏭️  ${SUPPLIER.code} ${SUPPLIER.name} 已存在 #${supplierId}，更新欄位`);
        await tx`
          UPDATE suppliers SET
            name = ${SUPPLIER.name}, category = ${SUPPLIER.category},
            contact = ${SUPPLIER.contact}, phone = ${SUPPLIER.phone},
            company_name = ${SUPPLIER.companyName}, tax_id = ${SUPPLIER.taxId},
            address = ${SUPPLIER.address}, payment_type = ${SUPPLIER.paymentType},
            lead_days = ${SUPPLIER.leadDays}, order_cutoff = ${SUPPLIER.orderCutoff},
            min_order_amount = ${SUPPLIER.minOrderAmount},
            free_shipping_min = ${SUPPLIER.freeShippingMin},
            notes = ${SUPPLIER.notes}
          WHERE id = ${supplierId}
        `;
      } else {
        const [row] = await tx`
          INSERT INTO suppliers
            (name, code, category, contact, phone, company_name, tax_id, address,
             payment_type, lead_days, order_cutoff, min_order_amount, free_shipping_min,
             notes, is_active, delivery_days)
          VALUES
            (${SUPPLIER.name}, ${SUPPLIER.code}, ${SUPPLIER.category},
             ${SUPPLIER.contact}, ${SUPPLIER.phone},
             ${SUPPLIER.companyName}, ${SUPPLIER.taxId}, ${SUPPLIER.address},
             ${SUPPLIER.paymentType}, ${SUPPLIER.leadDays}, ${SUPPLIER.orderCutoff},
             ${SUPPLIER.minOrderAmount}, ${SUPPLIER.freeShippingMin},
             ${SUPPLIER.notes}, true, 1)
          RETURNING id
        `;
        supplierId = row.id;
        supplierCreated = true;
        console.log(`   ✅ ${SUPPLIER.code} ${SUPPLIER.name} 建立 #${supplierId}`);
        console.log(`      公司：${SUPPLIER.companyName}（統編 ${SUPPLIER.taxId}）`);
        console.log(`      地址：${SUPPLIER.address}`);
        console.log(`      聯絡：${SUPPLIER.contact} / ${SUPPLIER.phone}`);
        console.log(`      規則：${SUPPLIER.orderCutoff} 截止 / 隔日配 / 滿 $${SUPPLIER.minOrderAmount}`);
      }

      // 2. 13 個品項
      console.log('\n📦 [2/2] 新增 13 個品項');
      console.log('────────────────────────────────────────');

      // 預先分配 SKU（同 prefix 連續分配避免同一 transaction 內衝突）
      const usedByPrefix: Record<string, number> = {};
      for (const it of NEW_ITEMS) {
        if (!(it.prefix in usedByPrefix)) {
          // 第一次見到此 prefix，從 DB 找最大號 +1
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
        // 跳過已被佔的（雖理論上不會發生，保險）
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
             ${supplierId}, ${it.aliases}, ${it.supplierNotes}, true)
          RETURNING id
        `;
        skuMap[it.name] = sku;
        const notes = it.supplierNotes ? ` 📝${it.supplierNotes.slice(0, 25)}...` : '';
        console.log(
          `   ✅ #${String(row.id).padEnd(4)} | ${sku} | ${it.name.padEnd(22, '　')} | ${it.unit.padEnd(4)} | $${it.costPrice}${notes}`
        );
      }
    });
  } catch (e) {
    console.error('\n❌ Transaction rollback：', e);
    await sql.end();
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════');
  console.log('🎉 完成');
  console.log('════════════════════════════════════════');
  console.log(`  供應商：${supplierCreated ? '新建' : '更新'} ${SUPPLIER.code} ${SUPPLIER.name} #${supplierId!}`);
  console.log(`  品項：13 筆`);
  console.log('');
  console.log('  📋 後續：');
  console.log('  1. 到後台 /dashboard/suppliers/' + supplierId! + ' 確認資料');
  console.log('  2. 補上公休日 (no_delivery_days) — 等行事曆 OCR/手動列出');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
