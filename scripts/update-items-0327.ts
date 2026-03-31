/**
 * 2026-03-27 品項大更新腳本
 *
 * 根據 POS (iChef) 比對 + Terry 確認：
 * 1. 改名 6 項
 * 2. 停售 10 項
 * 3. 售價以 POS 為準
 * 4. 出餐規格更新
 * 5. 進貨成本更新（from Excel 食材成本總表）
 *
 * 執行：npx tsx scripts/update-items-0327.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('🔄 開始品項大更新 (2026-03-27)...\n');

  // ═══════════════════════════════════════════
  // 1. 改名（items 表）
  // ═══════════════════════════════════════════
  console.log('📝 1. 改名...');

  const renames = [
    { old: '牛胸口油', new: '牛胸肉片', aliases: ['牛胸肉片','牛胸肉','胸口油','前胸'] },
    { old: '日本A5三叉', new: '日本A5和牛', aliases: ['A5','A5和牛','日本A5','日本A5和牛','三叉'] },
    { old: '袖珍菇', new: '秀珍菇', aliases: ['秀珍菇'] },
    { old: '花枝漿', new: '澎湖花枝漿', aliases: ['花枝漿','澎湖花枝漿'] },
    { old: '竹蓀', new: '竹笙', aliases: ['竹笙','竹蓀'] },
  ];

  for (const r of renames) {
    const res = await sql`
      UPDATE items SET name = ${r.new}, aliases = ${r.aliases}
      WHERE name = ${r.old} AND is_active = true
    `;
    console.log(`   ${r.old} → ${r.new} (${res.length > 0 ? '✅' : '⚠️ 未找到'})`);
  }

  // 羊五花 + 羊肉捲 → 合併為羊肉捲捲
  // 停用羊五花，把羊肉捲改名
  await sql`UPDATE items SET name = '羊肉捲捲', aliases = ARRAY['羊肉捲捲','羊肉捲','羊捲','羊五花','羊肉'] WHERE name = '羊肉捲'`;
  await sql`UPDATE items SET is_active = false WHERE name = '羊五花'`;
  console.log('   羊肉捲 → 羊肉捲捲（合併羊五花）✅');

  // ═══════════════════════════════════════════
  // 2. 停售（items 表 is_active = false）
  // ═══════════════════════════════════════════
  console.log('\n🚫 2. 停售...');

  const deactivate = [
    '鹿兒島和牛',
    '北海道和牛',
    '白帶魚卷',
    '牡蠣',
    '花枝丸',
  ];

  for (const name of deactivate) {
    const res = await sql`UPDATE items SET is_active = false WHERE name = ${name}`;
    console.log(`   ${name} → 停售 (${res.length > 0 ? '✅' : '⚠️ 未找到'})`);
  }

  // menu_items 表也要停售對應的
  const menuDeactivate = [
    '麻辣排骨',
    '切塊豬蹄',
    '蟹肉棒',
    '鮮牛肉丸',
    '手工甜豆花',
    '鹿兒島和牛',
    '北海道和牛',
    '白帶魚卷',
    '牡蠣',
    '花枝丸',
  ];

  for (const name of menuDeactivate) {
    await sql`UPDATE menu_items SET is_active = false WHERE name = ${name}`;
    console.log(`   menu: ${name} → 停售`);
  }

  // ═══════════════════════════════════════════
  // 3. 售價更新（以 POS 為準）
  // ═══════════════════════════════════════════
  console.log('\n💰 3. 售價更新...');

  const priceUpdates = [
    // items 表售價
    { name: '吊龍', sellPrice: 480 },
    { name: '日本A5和牛', sellPrice: 1080 },
    { name: '高麗菜', sellPrice: 120 },
    { name: '大白菜', sellPrice: 120 },
    { name: '海尼根', sellPrice: 150 },
  ];

  for (const p of priceUpdates) {
    await sql`UPDATE items SET sell_price = ${p.sellPrice} WHERE name = ${p.name}`;
    console.log(`   ${p.name} → $${p.sellPrice}`);
  }

  // menu_items 表售價也同步
  const menuPriceUpdates = [
    { name: '溫體吊龍', sellPrice: 480 },
    { name: '日本A5和牛', sellPrice: 1080 },
    { name: '高麗菜', sellPrice: 120 },
    { name: '大白菜', sellPrice: 120 },
    { name: '海尼根', sellPrice: 150 },
  ];

  for (const p of menuPriceUpdates) {
    await sql`UPDATE menu_items SET sell_price = ${p.sellPrice} WHERE name = ${p.name}`;
  }

  // ═══════════════════════════════════════════
  // 4. 出餐規格更新（items.spec）
  // ═══════════════════════════════════════════
  console.log('\n📐 4. 出餐規格更新...');

  const specUpdates: { name: string; spec: string }[] = [
    // 滷煮系列 → 120g
    { name: '滷肥腸', spec: '120g/份' },
    { name: '滷牛筋', spec: '120g/份' },
    { name: '滷牛肚', spec: '120g/份' },
    { name: '滷雞腳', spec: '5隻/份' },

    // 修正規格
    { name: '高麗菜', spec: '120g/份' },
    { name: '大白菜', spec: '120g/份' },
    { name: '玉米', spec: '220g/份' },

    // 確認規格（部分可能已正確）
    { name: '蓮藕', spec: '120g/份' },
    { name: '馬鈴薯', spec: '120g/份' },
    { name: '台灣山藥', spec: '120g/份' },
    { name: '日本山藥', spec: '120g/份' },
    { name: '南瓜', spec: '120g/份' },
    { name: '白蘿蔔', spec: '120g/份' },
    { name: '黑木耳', spec: '120g/份' },
    { name: '鴻喜菇', spec: '80g/份' },
    { name: '小香菇', spec: '80g/份' },
    { name: '皇宮菜', spec: '100g/份' },
    { name: '貢菜', spec: '100g/份' },
    { name: '金針菇', spec: '1包/份' },
    { name: '玉米筍', spec: '1盒/份' },
    { name: '娃娃菜', spec: '2顆/份' },
    { name: '澎湖花枝漿', spec: '60g/份' },
    { name: '雞滑', spec: '60g/份' },
    { name: '蝦滑', spec: '60g/份' },
    { name: '紐澳重組牛舌', spec: '110g/份' },
    { name: '凍豆腐', spec: '8個/份' },
    { name: '板豆腐', spec: '6片/份' },
    { name: '鴨血', spec: '6片/份' },
    { name: '刻花魷魚', spec: '150g/份' },
    { name: '鱸魚', spec: '150g/份' },
    { name: '巴沙魚', spec: '150g/份' },
    { name: '手撕鮮毛肚', spec: '150g/份' },
    { name: '紅糖糍粑', spec: '5條/份' },
    { name: '酥肉', spec: '80g/份' },
    { name: '竹笙', spec: '10g/份' },
    { name: '老油條', spec: '6塊/份' },
    { name: '奶油白菜', spec: '120g/份' },
    { name: '秀珍菇', spec: '100g/份' },
    { name: '山茼蒿', spec: '120g/份' },
    { name: '海帶芽', spec: '150g/份' },
  ];

  for (const s of specUpdates) {
    const res = await sql`UPDATE items SET spec = ${s.spec} WHERE name = ${s.name}`;
    console.log(`   ${s.name} → ${s.spec}`);
  }

  // ═══════════════════════════════════════════
  // 5. 進貨成本更新（from Excel，含稅 per portion）
  // ═══════════════════════════════════════════
  console.log('\n💵 5. 進貨成本更新 (from Excel)...');

  // Excel 肉品 per kg 報價 → per portion cost (integer 元)
  const costUpdates = [
    // 肉品 (per portion)
    // 無骨牛小排: 美福 $1120/kg, 120g/份 → $134
    { name: '無骨牛小排', costPrice: 134 },
    // 牛胸肉片: 美福 $385/kg, 120g/份 → $46
    { name: '牛胸肉片', costPrice: 46 },
    // CH霜降牛: 以曜 $365/kg, 120g/份 → $44
    { name: 'CH霜降牛', costPrice: 44 },
    // CH板腱牛: 以曜 $385/kg, 120g/份 → $46
    { name: 'CH板腱牛', costPrice: 46 },
    // 牛舌: 以曜 $580/kg, 110g/份 → $64
    { name: '紐澳重組牛舌', costPrice: 64 },
    // 松阪豬: 以曜 $490/kg, 120g/份 → $59
    { name: '松阪豬', costPrice: 59 },
    // 台灣豬五花: 以曜 $280/kg, 120g/份 → $34
    { name: '台灣豬五花', costPrice: 34 },
    // 梅花豬: 以曜 $250/kg, 120g/份 → $30
    { name: '梅花豬', costPrice: 30 },
    // 羊肉捲捲: 以曜 $380/kg, 120g/份 → $46
    { name: '羊肉捲捲', costPrice: 46 },
    // 牛五花: 以曜 $215/kg, 120g/份 → $26
    { name: '牛五花', costPrice: 26 },
    // 日本A5和牛: 以曜 $1200/kg, 100g/份 → $120
    { name: '日本A5和牛', costPrice: 120 },
    // 究好豬: 品鮮璞 $340/kg, 120g/份 → $41
    { name: '究好豬', costPrice: 41 },
    // 午餐肉: 悠西 $129/340g → per 113g ≈ $43
    { name: '午餐肉', costPrice: 43 },
    // 吊龍: $700/600g → 120g/份 → $140
    { name: '吊龍', costPrice: 140 },

    // 酒水 (per bottle)
    { name: '可爾必思', costPrice: 38 },
    { name: '麥仔茶', costPrice: 27 },
    { name: '每朝綠茶', costPrice: 30 },
    { name: '每朝紅茶', costPrice: 30 },
    { name: '酸梅湯', costPrice: 30 },
    { name: '可樂', costPrice: 12 },
    { name: '雪碧', costPrice: 12 },
    { name: '加多寶', costPrice: 27 },
    { name: '礦泉水', costPrice: 7 },
    { name: '沙士', costPrice: 23 },
    { name: '芭樂汁', costPrice: 28 },
    { name: '台灣啤酒', costPrice: 47 },
    { name: '金牌啤酒', costPrice: 48 },
    { name: '18天', costPrice: 70 },
    { name: '海尼根', costPrice: 78 },
    { name: '百威金尊', costPrice: 68 },
    { name: '紅百威', costPrice: 68 },
    { name: '青島', costPrice: 69 },
    { name: '真露-原味', costPrice: 88 },
    { name: '真露-草莓', costPrice: 125 },
    { name: '真露-水蜜桃', costPrice: 125 },
    { name: '真露-葡萄柚', costPrice: 125 },
    { name: '真露-蜜桃李', costPrice: 125 },
    { name: '百富12年', costPrice: 1450 },
  ];

  for (const c of costUpdates) {
    await sql`UPDATE items SET cost_price = ${c.costPrice} WHERE name = ${c.name}`;
    console.log(`   ${c.name} → 進貨 $${c.costPrice}`);
  }

  // ═══════════════════════════════════════════
  // 6. 吊龍備註（損耗 8-10%）
  // ═══════════════════════════════════════════
  console.log('\n📝 6. 品項備註...');
  await sql`UPDATE items SET spec = '120g/份（損耗8-10%）' WHERE name = '吊龍'`;
  console.log('   吊龍 → 120g/份（損耗8-10%）');

  // 巴沙魚進貨備註
  await sql`UPDATE items SET spec = '150g/份（進貨: 1包3片, 1盒45片）' WHERE name = '巴沙魚'`;
  console.log('   巴沙魚 → 150g/份（進貨: 1包3片, 1盒45片）');

  // 紅糖糍粑進貨備註
  await sql`UPDATE items SET spec = '5條/份（進貨: 1盒40條）' WHERE name = '紅糖糍粑'`;
  console.log('   紅糖糍粑 → 5條/份（進貨: 1盒40條）');

  // ═══════════════════════════════════════════
  // 7. menu_items 改名同步
  // ═══════════════════════════════════════════
  console.log('\n📝 7. menu_items 改名同步...');

  const menuRenames = [
    { old: '牛胸口油', new: '牛胸肉片' },
    { old: '日本A5三叉', new: '日本A5和牛' },
    { old: '袖珍菇', new: '秀珍菇' },
    { old: '花枝漿', new: '澎湖花枝漿' },
    { old: '竹蓀', new: '竹笙' },
    { old: '羊肉捲', new: '羊肉捲捲' },
    { old: '羊五花', new: '羊肉捲捲' },
  ];

  for (const r of menuRenames) {
    await sql`UPDATE menu_items SET name = ${r.new} WHERE name = ${r.old}`;
    console.log(`   menu: ${r.old} → ${r.new}`);
  }

  // ═══════════════════════════════════════════
  // 8. 最終統計
  // ═══════════════════════════════════════════
  const activeItems = await sql`SELECT COUNT(*) as cnt FROM items WHERE is_active = true`;
  const inactiveItems = await sql`SELECT COUNT(*) as cnt FROM items WHERE is_active = false`;
  const activeMenu = await sql`SELECT COUNT(*) as cnt FROM menu_items WHERE is_active = true`;
  const inactiveMenu = await sql`SELECT COUNT(*) as cnt FROM menu_items WHERE is_active = false`;

  console.log('\n═══════════════════════════════════════');
  console.log(`📊 更新完成！`);
  console.log(`   items: ${activeItems[0].cnt} 啟用 / ${inactiveItems[0].cnt} 停售`);
  console.log(`   menu_items: ${activeMenu[0].cnt} 啟用 / ${inactiveMenu[0].cnt} 停售`);
  console.log('═══════════════════════════════════════');
}

main().catch((err) => {
  console.error('❌ 更新失敗：', err);
  process.exit(1);
});
