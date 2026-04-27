/**
 * 為 receiving 表加 returned_qty 欄位（退貨數量）
 *
 * 目的：支援部分退貨計算應付金額
 *      應付 = (received_qty - returned_qty) × unit_price
 *
 * 使用：npx tsx scripts/add-receiving-returned-qty.ts
 *
 * 幂等 — 重複執行安全（用 information_schema.columns 檢查）
 */
import { config } from 'dotenv';
import postgres from 'postgres';

// 讀取 .env.local
config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 未設定');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false });

async function main() {
  console.log('🔌 連線到資料庫...');

  // 檢查欄位是否已存在
  const existing = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'receiving'
      AND column_name = 'returned_qty'
  `;

  if (existing.length > 0) {
    console.log('ℹ️  receiving.returned_qty 欄位已存在，跳過');
  } else {
    console.log('📐 加 receiving.returned_qty 欄位...');
    await sql.unsafe(`
      ALTER TABLE "receiving"
        ADD COLUMN "returned_qty" NUMERIC(10, 2) NOT NULL DEFAULT 0
    `);
    console.log('✅ 欄位建立完成');
  }

  // 確認所有現有 receiving 紀錄的 returned_qty 都是 0（DEFAULT 應該保證了，這裡是 sanity check）
  const [{ count, max_returned }] = await sql`
    SELECT COUNT(*)::int as count, COALESCE(MAX(returned_qty), 0) as max_returned
    FROM receiving
  ` as unknown as Array<{ count: number; max_returned: string | number }>;

  console.log(`ℹ️  現有 receiving 紀錄共 ${count} 筆，returned_qty 最大值 = ${max_returned}（應為 0）`);

  console.log('\n🎉 完成。應付金額計算已啟用：(received_qty - returned_qty) × unit_price');
}

main()
  .catch((err) => {
    console.error('❌ 執行失敗:', err);
    process.exit(1);
  })
  .finally(() => sql.end());
