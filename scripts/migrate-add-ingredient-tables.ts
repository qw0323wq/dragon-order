/**
 * Phase 1.1 — DDL：新增 ingredients 表 + items/bom_items 加欄位
 *
 * 用法：npx tsx scripts/migrate-add-ingredient-tables.ts
 *
 * 三層架構建立：
 *   menu_items
 *      ↓ bom_items.ingredient_id
 *   ingredients (新表)
 *      ↓ items.ingredient_id (多家 SKU 同一個食材)
 *   items
 *
 * 冪等：CREATE TABLE IF NOT EXISTS、ALTER TABLE ADD COLUMN IF NOT EXISTS
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  try {
    console.log("=== Phase 1.1 DDL ===\n");

    // ── 1. ingredients 表 ──
    console.log("1. 建 ingredients 表...");
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS ingredients (
        id          serial PRIMARY KEY,
        name        varchar(100) NOT NULL UNIQUE,
        category    varchar(20),
        unit        varchar(10) NOT NULL,
        notes       text,
        created_at  timestamp DEFAULT now() NOT NULL,
        updated_at  timestamp DEFAULT now() NOT NULL
      )
    `);
    console.log("   ✓ ingredients 表 ready");

    // 建索引加速關聯查詢
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_ingredients_category
        ON ingredients(category)
    `);
    console.log("   ✓ idx_ingredients_category");

    // ── 2. items 加 ingredient_id + is_primary ──
    console.log("\n2. items 加 ingredient_id + is_primary...");
    await client.unsafe(`
      ALTER TABLE items
        ADD COLUMN IF NOT EXISTS ingredient_id integer
          REFERENCES ingredients(id) ON DELETE SET NULL
    `);
    await client.unsafe(`
      ALTER TABLE items
        ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false NOT NULL
    `);
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_items_ingredient
        ON items(ingredient_id)
    `);
    console.log("   ✓ items.ingredient_id + is_primary + index");

    // ── 3. bom_items 加 ingredient_id + quantity_value + quantity_unit ──
    console.log("\n3. bom_items 加 ingredient_id + quantity_value + quantity_unit...");
    await client.unsafe(`
      ALTER TABLE bom_items
        ADD COLUMN IF NOT EXISTS ingredient_id integer
          REFERENCES ingredients(id) ON DELETE SET NULL
    `);
    await client.unsafe(`
      ALTER TABLE bom_items
        ADD COLUMN IF NOT EXISTS quantity_value numeric(10, 3)
    `);
    await client.unsafe(`
      ALTER TABLE bom_items
        ADD COLUMN IF NOT EXISTS quantity_unit varchar(10)
    `);
    await client.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_bom_ingredient
        ON bom_items(ingredient_id)
    `);
    console.log("   ✓ bom_items.ingredient_id + quantity_value + quantity_unit + index");

    // ── 4. 驗證 ──
    console.log("\n4. 驗證新欄位...");
    const cols = (await client`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'ingredients')
          OR (table_name = 'items' AND column_name IN ('ingredient_id', 'is_primary'))
          OR (table_name = 'bom_items' AND column_name IN ('ingredient_id', 'quantity_value', 'quantity_unit')))
      ORDER BY table_name, column_name
    `) as unknown as Array<{ table_name: string; column_name: string; data_type: string }>;
    for (const c of cols) {
      console.log(`   ${c.table_name.padEnd(15)} ${c.column_name.padEnd(20)} ${c.data_type}`);
    }

    console.log("\n✅ DDL 完成");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ DDL 失敗:", err);
  process.exit(1);
});
