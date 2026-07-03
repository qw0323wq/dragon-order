/**
 * Phase B Step 1 — 加 bom_items.cost_factor 欄位（跨維度單位換算係數）
 * 非破壞性 additive；交易內驗證後 commit。冪等（IF NOT EXISTS）。
 *   npx tsx scripts/add-bom-cost-factor.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
async function main() {
  // 事前：欄位是否已存在
  const before = await sql`
    SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
    FROM information_schema.columns
    WHERE table_name='bom_items' AND column_name='cost_factor'`;
  console.log('事前 cost_factor:', before.length ? before[0] : '(不存在)');

  await sql.begin(async (tx) => {
    await tx`ALTER TABLE bom_items ADD COLUMN IF NOT EXISTS cost_factor numeric(14,8)`;
    const [chk] = await tx`
      SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
      FROM information_schema.columns
      WHERE table_name='bom_items' AND column_name='cost_factor'`;
    if (!chk) throw new Error('❌ 加欄位後查不到，rollback');
    if (chk.is_nullable !== 'YES') throw new Error('❌ 欄位非 nullable，rollback');
    console.log('交易內驗證通過：', chk);
    // 順帶確認沒有既有資料被動到（cost_factor 應全 null）
    const [cnt] = await tx`SELECT COUNT(*)::int total, COUNT(cost_factor)::int nonnull FROM bom_items`;
    console.log(`bom_items 共 ${cnt.total} 筆，cost_factor 非 null = ${cnt.nonnull}（應為 0）`);
  });
  console.log('✅ 已 commit：bom_items.cost_factor numeric(14,8) NULL');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
