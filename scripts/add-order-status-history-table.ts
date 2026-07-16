/**
 * 建立 order_status_history 表（訂單狀態歷史 / audit trail）
 *
 * 用途：訂單頁「歷史紀錄」時間線所需的新表
 * 使用：npx tsx scripts/add-order-status-history-table.ts
 * Rollback：DROP TABLE order_status_history;（純新增表，不影響既有資料）
 *
 * 冪等 — 重複執行安全（先檢查 information_schema）
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

  const existing = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_status_history'
  `;

  if (existing.length > 0) {
    console.log('ℹ️  order_status_history 表已存在，跳過建立');
  } else {
    console.log('📐 建立 order_status_history 表...');
    await sql.unsafe(`
      CREATE TABLE "order_status_history" (
        "id" serial PRIMARY KEY NOT NULL,
        "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "status" varchar(20) NOT NULL,
        "changed_by" integer REFERENCES "users"("id"),
        "note" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `);
    // 外鍵欄位建索引（Postgres 不會自動建；歷史查詢都以 order_id 為條件）
    await sql.unsafe(`
      CREATE INDEX "idx_order_status_history_order_id" ON "order_status_history"("order_id")
    `);
    console.log('✅ order_status_history 表 + 索引建立完成');
  }

  await sql.end();
  console.log('🏁 完成');
}

main().catch((err) => {
  console.error('❌ 失敗:', err);
  process.exit(1);
});
