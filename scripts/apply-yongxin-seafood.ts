/**
 * 新增供應商：永鑫國際水產有限公司（SF-04）+ 20 個海鮮品項
 *
 * 來源：iCloud/肥龍/採購/廠商報價/.../永鑫國際水產/肥龍報價單.xls（115/4/11 報價）
 *
 * 動作（單一 transaction）：
 *   1. 新建供應商 永鑫國際水產（SF-04）+ 商務資訊（統編/地址/聯絡/配送/月結）
 *   2. 新建 20 個品項，名稱加「（永鑫）」後綴，SKU 走 SF- 流水號
 *   3. 每個品項建對應 ingredient（1:1，規格烤進名，比照現有海鮮慣例）+ 連 ingredient_id + is_primary=true
 *   4. 規格存 spec、箱容存 pack_size、原價格單位換算成 cost_price + unit
 *
 * 冪等：供應商 code / 品項名 / ingredient 名 已存在會跳過
 *
 * 用法：
 *   npx tsx scripts/apply-yongxin-seafood.ts            # dry-run（只印計畫）
 *   npx tsx scripts/apply-yongxin-seafood.ts --apply    # 實際寫入
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');

const SUPPLIER = {
  code: 'SF-04',
  name: '永鑫國際水產',
  category: '海鮮',
  companyName: '永鑫國際水產有限公司',
  taxId: '94070128',
  address: '新北市新莊區幸福東路81號2樓7室',
  contact: '洪浩洋',
  phone: '0927369170',
  paymentType: '月結',
  noDeliveryDays: [0], // 週日公休（+ 國定假日）
  leadDays: 0,         // 早上6點前下單當天可到
  deliveryDays: 0,
  orderCutoff: '06:00',
  freeShippingMin: 1500, // 盡量湊滿 $1500 免運
  minOrderAmount: 0,     // 無硬性起送門檻
  orderDays: [1, 2, 3, 4, 5, 6], // 週一～週六可叫（週日公休）
  notes: 'LINE ID：alasty｜業務 洪浩洋 0927369170｜早上6點前下單當天可到、之後隔天｜週日及國定假日公休｜盡量湊滿 $1500 免運｜月結',
};

interface NewItem {
  name: string;          // 含（永鑫）後綴
  ingredientName: string; // 對應食材名（乾淨、規格烤進去）
  unit: string;
  costPrice: number;
  spec: string | null;   // 規格（內部備註欄）
  packSize: string | null; // 箱容/件
  storageType: 'frozen' | 'cold' | 'room';
  aliases: string[];
}

// 依 Excel 報價單順序（20 項）
const ITEMS: NewItem[] = [
  { name: '鱸魚清肉300/400（永鑫）', ingredientName: '鱸魚清肉300/400', unit: '公斤', costPrice: 340, spec: '300/400', packSize: '10公斤/箱', storageType: 'frozen', aliases: ['鱸魚', '鱸魚清肉', '海鱸魚'] },
  { name: '鱸魚清肉200/300（永鑫）', ingredientName: '鱸魚清肉200/300', unit: '公斤', costPrice: 330, spec: '200/300', packSize: '10公斤/箱', storageType: 'frozen', aliases: ['鱸魚', '鱸魚清肉'] },
  { name: '巴沙魚3P（永鑫）', ingredientName: '巴沙魚3P', unit: '包', costPrice: 95, spec: '3P', packSize: '10公斤/箱', storageType: 'frozen', aliases: ['巴沙魚', '多利魚'] },
  { name: '刻花花枝（永鑫）', ingredientName: '刻花花枝', unit: '包', costPrice: 135, spec: null, packSize: '10包/件', storageType: 'frozen', aliases: ['刻花花枝', '花枝'] },
  { name: '南美白蝦40/50（永鑫）', ingredientName: '南美白蝦40/50', unit: '盒', costPrice: 210, spec: '40/50', packSize: '14盒/件', storageType: 'frozen', aliases: ['南美白蝦', '白蝦'] },
  { name: '南美白蝦50/60（永鑫）', ingredientName: '南美白蝦50/60', unit: '盒', costPrice: 205, spec: '50/60', packSize: '12盒/件', storageType: 'frozen', aliases: ['南美白蝦', '白蝦'] },
  { name: '龍蝦400/500（永鑫）', ingredientName: '龍蝦400/500', unit: '公斤', costPrice: 980, spec: '400/500', packSize: '10公斤/箱', storageType: 'frozen', aliases: ['龍蝦'] },
  { name: '青衣（永鑫）', ingredientName: '青衣', unit: '公斤', costPrice: 400, spec: null, packSize: '不定重', storageType: 'cold', aliases: ['青衣', '青衣魚'] },
  { name: '紅條（永鑫）', ingredientName: '紅條', unit: '公斤', costPrice: 820, spec: null, packSize: '不定重', storageType: 'cold', aliases: ['紅條', '紅條魚'] },
  { name: '五片鯛魚片（永鑫）', ingredientName: '五片鯛魚片', unit: '包', costPrice: 135, spec: '400克/包', packSize: '25包/件', storageType: 'frozen', aliases: ['鯛魚片', '鯛魚'] },
  { name: '盤鮑22P（永鑫）', ingredientName: '盤鮑22P', unit: '包', costPrice: 250, spec: '22P', packSize: '12包/件', storageType: 'frozen', aliases: ['盤鮑', '鮑魚'] },
  { name: '生蠔清肉2L（永鑫）', ingredientName: '生蠔清肉2L', unit: '包', costPrice: 570, spec: '2L', packSize: '10包/件', storageType: 'frozen', aliases: ['生蠔', '蚵', '生蠔清肉'] },
  { name: '三排小卷（永鑫）', ingredientName: '三排小卷', unit: '盒', costPrice: 120, spec: null, packSize: null, storageType: 'frozen', aliases: ['小卷', '三排小卷'] },
  { name: '竹葉（永鑫）', ingredientName: '竹葉', unit: '包', costPrice: 160, spec: null, packSize: null, storageType: 'frozen', aliases: ['竹葉'] },
  { name: '肥豬蝦16P（永鑫）', ingredientName: '肥豬蝦16P', unit: '盒', costPrice: 800, spec: '16P', packSize: '11盒/件', storageType: 'frozen', aliases: ['肥豬蝦'] },
  { name: '軟絲300/400（永鑫）', ingredientName: '軟絲300/400', unit: '公斤', costPrice: 340, spec: '300/400', packSize: '12KG/件', storageType: 'frozen', aliases: ['軟絲'] },
  { name: '鮭魚清肉（永鑫）', ingredientName: '鮭魚清肉', unit: '公斤', costPrice: 300, spec: null, packSize: '不定重', storageType: 'cold', aliases: ['鮭魚', '鮭魚清肉'] },
  { name: '龍膽石斑清肉250G（永鑫）', ingredientName: '龍膽石斑清肉250G', unit: '包', costPrice: 345, spec: '250G', packSize: '60包/件', storageType: 'frozen', aliases: ['龍膽石斑', '石斑'] },
  { name: '草蝦10P（永鑫）', ingredientName: '草蝦10P', unit: '盒', costPrice: 120, spec: '10P', packSize: '12盒/件', storageType: 'frozen', aliases: ['草蝦'] },
  { name: '草蝦16P（永鑫）', ingredientName: '草蝦16P', unit: '盒', costPrice: 120, spec: '16P', packSize: '12盒/件', storageType: 'frozen', aliases: ['草蝦'] },
];

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });
  console.log(`=== 永鑫國際水產建檔 (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);
  try {
    // 供應商是否已存在
    const [existSup] = await c`SELECT id FROM suppliers WHERE code = ${SUPPLIER.code} OR tax_id = ${SUPPLIER.taxId}`;
    console.log(existSup ? `供應商已存在 (#${existSup.id})，跳過新建` : `→ 新建供應商 ${SUPPLIER.name} (${SUPPLIER.code})`);

    // 下一個 SF 流水號
    const [maxSku] = await c`SELECT sku FROM items WHERE sku ~ '^SF-[0-9]+$' ORDER BY sku DESC LIMIT 1`;
    let seq = maxSku ? parseInt(String(maxSku.sku).match(/-(\d+)$/)![1]) : 0;
    console.log(`目前最大 SF SKU：${maxSku?.sku ?? '(無)'}，新品項從 SF-${String(seq + 1).padStart(3, '0')} 開始\n`);

    console.log('品項計畫：');
    for (const it of ITEMS) {
      seq++;
      console.log(`  SF-${String(seq).padStart(3, '0')}  ${it.name.padEnd(22)} $${it.costPrice}/${it.unit}  [${it.storageType}] 食材=${it.ingredientName}`);
    }

    if (!APPLY) {
      console.log('\n[dry-run] 未寫入。確認無誤加 --apply 執行。');
      return;
    }

    await c.begin(async (tx) => {
      // 1. 供應商
      let supplierId: number;
      if (existSup) {
        supplierId = existSup.id as number;
      } else {
        const [sup] = await tx`
          INSERT INTO suppliers
            (code, name, category, company_name, tax_id, address, contact, phone,
             payment_type, no_delivery_days, lead_days, delivery_days, order_cutoff,
             free_shipping_min, min_order_amount, order_days, notes)
          VALUES
            (${SUPPLIER.code}, ${SUPPLIER.name}, ${SUPPLIER.category}, ${SUPPLIER.companyName},
             ${SUPPLIER.taxId}, ${SUPPLIER.address}, ${SUPPLIER.contact}, ${SUPPLIER.phone},
             ${SUPPLIER.paymentType}, ${SUPPLIER.noDeliveryDays}, ${SUPPLIER.leadDays},
             ${SUPPLIER.deliveryDays}, ${SUPPLIER.orderCutoff}, ${SUPPLIER.freeShippingMin},
             ${SUPPLIER.minOrderAmount}, ${SUPPLIER.orderDays}, ${SUPPLIER.notes})
          RETURNING id
        `;
        supplierId = sup.id as number;
      }
      console.log(`\n✓ 供應商 id=${supplierId}`);

      // 重新取最大 SF 序號（transaction 內保險）
      const [mx] = await tx`SELECT sku FROM items WHERE sku ~ '^SF-[0-9]+$' ORDER BY sku DESC LIMIT 1`;
      let n = mx ? parseInt(String(mx.sku).match(/-(\d+)$/)![1]) : 0;

      let created = 0, skipped = 0;
      for (const it of ITEMS) {
        // 品項已存在？（同名同供應商）
        const [exist] = await tx`SELECT id FROM items WHERE name = ${it.name} AND supplier_id = ${supplierId}`;
        if (exist) { skipped++; console.log(`  ⏭ ${it.name} 已存在`); continue; }

        // ingredient upsert（1:1）
        const [ingIns] = await tx`
          INSERT INTO ingredients (name, category, unit)
          VALUES (${it.ingredientName}, ${SUPPLIER.category}, ${it.unit})
          ON CONFLICT (name) DO NOTHING
          RETURNING id
        `;
        let ingredientId: number;
        if (ingIns) {
          ingredientId = ingIns.id as number;
        } else {
          const [ex] = await tx`SELECT id FROM ingredients WHERE name = ${it.ingredientName}`;
          ingredientId = ex.id as number;
        }

        n++;
        const sku = `SF-${String(n).padStart(3, '0')}`;
        await tx`
          INSERT INTO items
            (sku, name, category, unit, supplier_id, cost_price, store_price, sell_price,
             spec, pack_size, storage_type, aliases, ingredient_id, is_primary, is_active)
          VALUES
            (${sku}, ${it.name}, ${SUPPLIER.category}, ${it.unit}, ${supplierId},
             ${it.costPrice}, 0, 0, ${it.spec}, ${it.packSize}, ${it.storageType},
             ${it.aliases}, ${ingredientId}, true, true)
        `;
        created++;
        console.log(`  ✓ ${sku} ${it.name} → 食材#${ingredientId}`);
      }
      console.log(`\n📊 新增 ${created} 品項、跳過 ${skipped}`);
    });

    console.log('\n✅ 完成');
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error('❌ 失敗:', e); process.exit(1); });
