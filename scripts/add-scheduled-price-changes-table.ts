/**
 * 建立 scheduled_price_changes 表（預約改價排程）
 *
 * 用途：price-schedule 功能所需的新表
 * 使用：npx tsx scripts/add-scheduled-price-changes-table.ts
 *
 * 幂等 — 重複執行安全（IF NOT EXISTS / try-catch 吞 duplicate）
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

  // 檢查表是否已存在
  const existing = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scheduled_price_changes'
  `;

  if (existing.length > 0) {
    console.log('ℹ️  scheduled_price_changes 表已存在，跳過建立');
  } else {
    console.log('📐 建立 scheduled_price_changes 表...');
    await sql.unsafe(`
      CREATE TABLE "scheduled_price_changes" (
        "id" serial PRIMARY KEY NOT NULL,
        "item_id" integer NOT NULL,
        "new_cost_price" integer NOT NULL,
        "new_store_price" integer,
        "effective_date" date NOT NULL,
        "source" varchar(100),
        "notes" text,
        "status" varchar(20) DEFAULT 'pending' NOT NULL,
        "created_by" integer,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "applied_at" timestamp
      )
    `);
    console.log('✅ 表建立完成');
  }

  // FK: item_id → items.id
  try {
    await sql.unsafe(`
      ALTER TABLE "scheduled_price_changes"
        ADD CONSTRAINT "scheduled_price_changes_item_id_items_id_fk"
        FOREIGN KEY ("item_id") REFERENCES "public"."items"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    console.log('✅ FK item_id → items.id 建立');
  } catch (e) {
    const msg = String(e);
    if (msg.includes('already exists')) {
      console.log('ℹ️  FK item_id 已存在，略過');
    } else {
      throw e;
    }
  }

  // FK: created_by → users.id
  try {
    await sql.unsafe(`
      ALTER TABLE "scheduled_price_changes"
        ADD CONSTRAINT "scheduled_price_changes_created_by_users_id_fk"
        FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    console.log('✅ FK created_by → users.id 建立');
  } catch (e) {
    const msg = String(e);
    if (msg.includes('already exists')) {
      console.log('ℹ️  FK created_by 已存在，略過');
    } else {
      throw e;
    }
  }

  // 索引（加快 cron 查詢）
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS "idx_scheduled_price_changes_status_date"
      ON "scheduled_price_changes"("status", "effective_date")
  `);
  console.log('✅ 索引 (status, effective_date) 建立');

  console.log('\n🎉 全部完成，可以開始用 price-schedule 功能了');
}

main()
  .catch((err) => {
    console.error('❌ 執行失敗:', err);
    process.exit(1);
  })
  .finally(() => sql.end());
