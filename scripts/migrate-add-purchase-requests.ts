/**
 * Migration：建 purchase_requests + purchase_request_items 表
 *
 * 用途：員工提的「叫貨需求」staging — 員工只說要什麼食材+多少，
 * 老闆在採購規劃頁決策廠商，確認後才拆單寫入 orders。
 *
 * 用法：npx tsx scripts/migrate-add-purchase-requests.ts
 * 冪等：CREATE TABLE IF NOT EXISTS / ADD CONSTRAINT 加 try-catch
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  try {
    console.log("=== Migration: purchase_requests + purchase_request_items ===\n");

    // 1. purchase_requests 主表
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS purchase_requests (
        id            serial PRIMARY KEY,
        store_id      integer NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
        request_date  date NOT NULL DEFAULT CURRENT_DATE,
        status        varchar(20) NOT NULL DEFAULT 'pending',
        created_by    integer REFERENCES users(id) ON DELETE SET NULL,
        processed_by  integer REFERENCES users(id) ON DELETE SET NULL,
        processed_at  timestamp,
        order_ids     integer[] DEFAULT '{}'::int[],
        notes         text,
        created_at    timestamp NOT NULL DEFAULT NOW(),
        updated_at    timestamp NOT NULL DEFAULT NOW()
      )
    `);
    console.log("✓ purchase_requests 表");

    // status: pending | processed | cancelled
    // order_ids: 拆單後產出的 orders.id 陣列（追溯用）

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_purchase_requests_status
        ON purchase_requests(status, request_date DESC)
    `);
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_purchase_requests_store
        ON purchase_requests(store_id, status)
    `);
    console.log("✓ purchase_requests indexes");

    // 2. purchase_request_items 明細表
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS purchase_request_items (
        id              serial PRIMARY KEY,
        request_id      integer NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
        ingredient_id   integer REFERENCES ingredients(id) ON DELETE SET NULL,
        ingredient_name varchar(100) NOT NULL,
        current_stock   numeric(10, 2),
        needed_qty      numeric(10, 2) NOT NULL,
        unit            varchar(10),
        suggested_item_id integer REFERENCES items(id) ON DELETE SET NULL,
        chosen_item_id  integer REFERENCES items(id) ON DELETE SET NULL,
        notes           text,
        sort_order      integer NOT NULL DEFAULT 0
      )
    `);
    console.log("✓ purchase_request_items 表");

    // suggested_item_id: 提需求時系統推薦的 SKU（主家）
    // chosen_item_id:    老闆最終選的 SKU（拆單時用）
    // 沒拆單前 chosen_item_id 預設等於 suggested_item_id（拆單時可改）

    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_pr_items_request
        ON purchase_request_items(request_id, sort_order)
    `);
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_pr_items_ingredient
        ON purchase_request_items(ingredient_id)
    `);
    console.log("✓ purchase_request_items indexes");

    // 驗證
    const tables = (await client`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'purchase_request%'
      ORDER BY table_name
    `) as unknown as Array<{ table_name: string }>;
    console.log("\n✓ 表存在驗證：", tables.map((t) => t.table_name).join(", "));

    console.log("\n✅ Migration 完成");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Migration 失敗:", err);
  process.exit(1);
});
