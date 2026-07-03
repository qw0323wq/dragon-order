/**
 * 回歸驗證 — BOM 分店毛利（用真正的 src/lib/bom-cost helper）
 *
 * 大改 BOM 成本計算後跑此腳本當 regression check（比照 bom-health.ts 的定位）。
 *
 * 純 SELECT，不改任何資料。比照 api/bom/route.ts 的成本累加 + mismatch 排除。
 * 修好後預期：重量類 0 爆表；剩餘負值只剩「跨維度未設 cost_factor（已排除→成本偏低不爆表）」。
 *   npx tsx scripts/diag-bom-margin.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { resolveUnitFactor } from '../src/lib/bom-cost';

config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  types: { numeric: { to: 1700, from: [1700], parse: (v: string) => parseFloat(v), serialize: (v: number) => String(v) } },
});

const DEFAULT_MARKUP = 20;
function effectiveStorePrice(costPrice: number, storePrice: number, markupPct: number): number {
  if (storePrice && storePrice > 0) return storePrice;
  const pct = Number.isFinite(markupPct) ? markupPct : DEFAULT_MARKUP;
  return costPrice * (1 + pct / 100);
}

async function main() {
  const bomRows = await sql`
    SELECT bi.id, bi.menu_item_id, bi.item_id, bi.ingredient_id, bi.ingredient_name,
           bi.quantity, bi.quantity_value, bi.quantity_unit, bi.cost_factor,
           prim.name as primary_item_name, prim.unit as primary_item_unit,
           prim.cost_price as primary_cost, prim.store_price as primary_store_price,
           prim.store_markup_pct as primary_markup_pct,
           fb.name as fb_item_name, fb.unit as fb_item_unit,
           fb.cost_price as fb_item_cost, fb.store_price as fb_item_store_price,
           fb.store_markup_pct as fb_markup_pct
    FROM bom_items bi
    LEFT JOIN LATERAL (
      SELECT id, name, unit, cost_price, store_price, store_markup_pct FROM items
      WHERE ingredient_id = bi.ingredient_id AND is_primary = true AND is_active = true AND cost_price > 0
      ORDER BY cost_price ASC, id ASC LIMIT 1
    ) prim ON true
    LEFT JOIN items fb ON bi.item_id = fb.id
    ORDER BY bi.menu_item_id, bi.sort_order
  `;
  const menuItems = await sql`SELECT id, name, category, sell_price FROM menu_items WHERE is_active = true`;

  type Row = (typeof bomRows)[number];
  const bomMap: Record<number, Row[]> = {};
  for (const b of bomRows) (bomMap[b.menu_item_id as number] ||= []).push(b);

  function resolve(b: Row) {
    let qtyValue = 0;
    if (b.quantity_value != null) qtyValue = parseFloat(String(b.quantity_value));
    if (!qtyValue || isNaN(qtyValue)) qtyValue = parseFloat(String(b.quantity)) || 0;
    const primCost = b.primary_cost != null ? Number(b.primary_cost) : 0;
    let costPrice = 0, storePrice = 0, markupPct = DEFAULT_MARKUP, itemUnit = '', level: 'primary' | 'fallback' | 'none' = 'none';
    if (primCost > 0) { costPrice = primCost; storePrice = Number(b.primary_store_price ?? 0); markupPct = b.primary_markup_pct != null ? Number(b.primary_markup_pct) : DEFAULT_MARKUP; itemUnit = String(b.primary_item_unit ?? ''); level = 'primary'; }
    else { const fbCost = b.fb_item_cost != null ? Number(b.fb_item_cost) : 0; if (fbCost > 0) { costPrice = fbCost; storePrice = Number(b.fb_item_store_price ?? 0); markupPct = b.fb_markup_pct != null ? Number(b.fb_markup_pct) : DEFAULT_MARKUP; itemUnit = String(b.fb_item_unit ?? ''); level = 'fallback'; } }
    // cost_factor：Phase B 才進 DB，這裡容忍不存在
    const costFactor = (b as Record<string, unknown>).cost_factor != null ? Number((b as Record<string, unknown>).cost_factor) : null;
    const uf = resolveUnitFactor(b.quantity_unit as string | null, itemUnit, costFactor);
    return { qtyValue, costPrice, storePrice, markupPct, itemUnit, level, ...uf };
  }

  const computed = menuItems.map((mi) => {
    const ings = bomMap[mi.id as number] || [];
    let hqCost = 0, hqRevenue = 0, mismatch = 0, unknown = 0;
    for (const b of ings) {
      const r = resolve(b);
      if (r.level === 'none' || r.qtyValue <= 0) { unknown++; continue; }
      if (r.kind === 'mismatch') { mismatch++; continue; }
      const q = r.qtyValue * r.factor;
      hqCost += q * r.costPrice;
      hqRevenue += q * effectiveStorePrice(r.costPrice, r.storePrice, r.markupPct);
    }
    const sellPrice = Number(mi.sell_price) || 0;
    const storeCost = Math.round(hqRevenue * 100) / 100;
    const storeMargin = sellPrice > 0 && storeCost > 0 ? (sellPrice - storeCost) / sellPrice : 0;
    return { name: mi.name, category: mi.category, sellPrice, storeCost, storeMargin, mismatch, unknown };
  });

  const stillExploding = computed.filter((c) => c.storeMargin < -1);
  const withMismatch = computed.filter((c) => c.mismatch > 0);
  const sane = computed.filter((c) => c.storeMargin >= 0 && c.storeMargin < 1 && c.storeCost > 0);

  console.log(`\n════════ 修正後回歸結果（真 helper）════════`);
  console.log(`  有售價菜：${computed.length} 道`);
  console.log(`  🔴 仍爆表(<-100%)：${stillExploding.length} 道  ← 應為 0`);
  console.log(`  🟢 毛利合理(0~100%)：${sane.length} 道`);
  console.log(`  ⚠️  含跨維度待設定(已排除成本)：${withMismatch.length} 道\n`);

  if (stillExploding.length) {
    console.log('  ❌ 仍爆表（不該出現）：');
    for (const c of stillExploding) console.log(`     [${c.category}] ${c.name} storeCost=$${c.storeCost} 毛利=${(c.storeMargin * 100).toFixed(0)}%`);
  }

  // 抽樣：原本爆表最慘的幾道，看修正後
  const spot = ['酥肉', '巴沙魚', '耙牛肉', '板腱牛', '無骨牛小排', '霜降牛', '鱸魚'];
  console.log('  ── 抽樣對照（原爆表菜）──');
  for (const name of spot) {
    const c = computed.find((x) => x.name.includes(name));
    if (c) console.log(`     [${c.category}] ${c.name.padEnd(8)} 售$${c.sellPrice} storeCost=$${c.storeCost} 毛利=${(c.storeMargin * 100).toFixed(1)}% ${c.mismatch ? `(跨維度×${c.mismatch}已排除)` : ''}`);
  }

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
