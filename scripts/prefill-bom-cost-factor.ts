/**
 * Phase B Step 7 — 預填 bom_items.cost_factor（只填「能確定推導」的跨維度行）
 *
 * 規則（保守，寧缺勿錯）：
 *   R1 packSize 帶重量（如 "2.5KG×3包/件"）且 BOM 用 g → factor = 1 / packWeightG
 *   R2 SKU 名含「N入」且 BOM 用 顆/個/粒 → factor = 1 / N
 *   R3 BOM 用量原文 "1整包" 且 SKU 單位=包 → factor = 1（整包=1包）
 *   R4 BOM 用量原文 "1份"   且 SKU 單位=碗 → factor = 1（1份=1碗）
 * 其餘跨維度行留 null，交給 BOM dialog 讓 Terry 設。
 *
 * 預設 dry-run；加 --apply 才真的寫（交易內驗證後 commit）。
 *   npx tsx scripts/prefill-bom-cost-factor.ts          # 只看
 *   npx tsx scripts/prefill-bom-cost-factor.ts --apply  # 寫入
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { resolveUnitFactor, unitToGrams } from '../src/lib/bom-cost';

config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  types: { numeric: { to: 1700, from: [1700], parse: (v: string) => parseFloat(v), serialize: (v: number) => String(v) } },
});

/** 從 packSize 解析總重量（公克）。解析不出回 null。 */
function parsePackWeightGrams(packSize: string | null): number | null {
  if (!packSize) return null;
  const m = packSize.match(/([\d.]+)\s*(kg|公斤|g|克|台斤|斤)/i);
  if (!m) return null;
  const perUnit = unitToGrams(m[2].toLowerCase() === 'kg' ? 'kg' : m[2]);
  if (perUnit == null) return null;
  const base = parseFloat(m[1]) * perUnit;
  const mult = packSize.match(/[×xX*]\s*(\d+)/); // "×3包"
  return mult ? base * parseFloat(mult[1]) : base;
}

/** 從 SKU 名解析「N入」。 */
function parseNru(name: string | null): number | null {
  const m = name?.match(/(\d+)\s*入/);
  return m ? parseFloat(m[1]) : null;
}

async function main() {
  const rows = await sql`
    SELECT bi.id, mi.name as menu, bi.ingredient_name, bi.quantity, bi.quantity_value, bi.quantity_unit,
           bi.cost_factor as existing,
           it.name as sku, it.unit as sku_unit, it.pack_size
    FROM bom_items bi
    JOIN menu_items mi ON mi.id = bi.menu_item_id AND mi.is_active = true
    JOIN items it ON it.ingredient_id = bi.ingredient_id AND it.is_primary = true AND it.is_active = true AND it.cost_price > 0
    ORDER BY mi.name
  `;

  const plans: { id: number; menu: string; sku: string; factor: number; rule: string; note: string }[] = [];
  for (const r of rows) {
    if (r.existing != null) continue; // 已有值不覆蓋
    const uf = resolveUnitFactor(r.quantity_unit as string | null, r.sku_unit as string | null, null);
    if (uf.kind !== 'mismatch') continue; // 只處理跨維度

    const bomUnit = (r.quantity_unit ?? '').trim();
    const skuUnit = (r.sku_unit ?? '').trim();
    const qtyRaw = String(r.quantity ?? '').trim();

    // R1 packSize 帶重量 + BOM 用 g
    if (unitToGrams(bomUnit) === 1) {
      const g = parsePackWeightGrams(r.pack_size as string | null);
      if (g && g > 0) { plans.push({ id: r.id as number, menu: r.menu as string, sku: r.sku as string, factor: 1 / g, rule: 'R1 packSize重量', note: `1 ${skuUnit} = ${g}g` }); continue; }
    }
    // R2 SKU 名「N入」+ BOM 用 顆/個/粒
    if (['顆', '個', '粒'].includes(bomUnit)) {
      const n = parseNru(r.sku as string | null);
      if (n && n > 0) { plans.push({ id: r.id as number, menu: r.menu as string, sku: r.sku as string, factor: 1 / n, rule: 'R2 N入', note: `1 ${skuUnit} = ${n} ${bomUnit}` }); continue; }
    }
    // R3 "1整包" → 包
    if (/整包/.test(qtyRaw) && skuUnit === '包') { plans.push({ id: r.id as number, menu: r.menu as string, sku: r.sku as string, factor: 1, rule: 'R3 整包=包', note: '1包=1整包' }); continue; }
    // R4 "1份" → 碗
    if (/^1\s*份/.test(qtyRaw) && skuUnit === '碗') { plans.push({ id: r.id as number, menu: r.menu as string, sku: r.sku as string, factor: 1, rule: 'R4 份=碗', note: '1碗=1份' }); continue; }
  }

  console.log(`\n可自動推導 ${plans.length} 筆（其餘跨維度留 null 給 UI 設）：\n`);
  for (const p of plans)
    console.log(`  #${p.id} [${p.menu}] ${p.sku}  factor=${p.factor.toFixed(8)}  (${p.rule}: ${p.note})`);

  if (!plans.length) { await sql.end(); return; }

  if (!APPLY) {
    console.log('\n🔸 dry-run（未寫入）。確認無誤後加 --apply。');
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const p of plans) {
      await tx`UPDATE bom_items SET cost_factor = ${p.factor} WHERE id = ${p.id} AND cost_factor IS NULL`;
    }
    // 交易內驗證：這些 id 現在都有值且等於預期
    const ids = plans.map((p) => p.id);
    const after = await tx`SELECT id, cost_factor FROM bom_items WHERE id IN ${tx(ids)}`;
    const map = new Map(after.map((a: { id: number; cost_factor: number }) => [a.id, Number(a.cost_factor)]));
    for (const p of plans) {
      const got = map.get(p.id);
      if (got == null || Math.abs(got - p.factor) > 1e-6) throw new Error(`❌ #${p.id} 驗證失敗 got=${got} want=${p.factor}，rollback`);
    }
    console.log(`\n交易內驗證通過：${plans.length} 筆都正確寫入。`);
  });
  console.log('✅ 已 commit。');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
