/**
 * Phase 1.2 — Seed ingredients + 對齊三層關聯
 *
 * 用法：npx tsx scripts/seed-ingredients.ts [--apply]
 *   無 --apply：dry-run 只印報告，DB 不動
 *   有 --apply：包 transaction 寫入
 *
 * 流程：
 *   Step 1: 收集 bom_items.ingredient_name + items.name → canonicalize → distinct
 *   Step 2: INSERT INTO ingredients (name UNIQUE)
 *   Step 3: 對齊 items.ingredient_id（用 canonicalize(items.name) 對 ingredient.name）
 *   Step 4: 對齊 bom_items.ingredient_id（用 canonicalize(ingredient_name) 對）
 *   Step 5: 標 is_primary（每個 ingredient 取 cost_price > 0 最低的 item）
 *   Step 6: 拆 bom_items.quantity 字串 → quantity_value + quantity_unit
 *
 * 收斂規則（拍板於 2026-05-22）：
 *   - 去【鍋底】/【番茄半】/【菌湯半】前綴 → canonical
 *   - 去（供應商）後綴 → canonical
 *   - 真露口味 dash 保留（真露-原味 ≠ 真露-草莓，菜單分計價）
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");

interface ItemRow {
  id: number;
  name: string;
  category: string;
  unit: string;
  cost_price: string;
  is_active: boolean;
}

interface BomRow {
  id: number;
  ingredient_name: string;
  quantity: string;
  item_id: number | null;
}

/** ingredient_name / item.name → canonical name */
function canonicalize(name: string): string {
  return name
    .replace(/^【[^】]+】\s*/g, "")     // 去【XX】前綴
    .replace(/[（(][^）)]+[）)]\s*$/, "") // 去（供應商）後綴
    .trim();
}

/** 拆 "150g" / "5顆" / "2~2.5個" / "1朵" 等字串 */
function parseQuantity(s: string): { value: number | null; unit: string | null } {
  if (!s || typeof s !== "string") return { value: null, unit: null };
  const trimmed = s.trim();

  // 範圍 "2~2.5個" / "120~150g" → 取平均
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[~～]\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (rangeMatch) {
    const v1 = parseFloat(rangeMatch[1]);
    const v2 = parseFloat(rangeMatch[2]);
    const unit = (rangeMatch[3] || "").trim();
    return { value: (v1 + v2) / 2, unit: unit || null };
  }

  // 一般 "150g" / "5顆" / "120g/份"
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.+?)(?:\s*\/.+)?$/);
  if (match) {
    return { value: parseFloat(match[1]), unit: (match[2] || "").trim() || null };
  }
  return { value: null, unit: null };
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  console.log(`=== Phase 1.2 Seed ingredients (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  try {
    // ── Step 1: 收集 canonical ingredient 名稱 ──
    console.log("Step 1: 收集 canonical ingredient 名稱...");

    const bomRows = await client`
      SELECT id, ingredient_name, quantity, item_id FROM bom_items
    ` as unknown as BomRow[];

    const itemRows = await client`
      SELECT id, name, category, unit, cost_price::text as cost_price, is_active
      FROM items WHERE is_active = true
    ` as unknown as ItemRow[];

    // 從 BOM 拉所有食材名稱
    const bomNames = new Set<string>();
    for (const b of bomRows) {
      const canonical = canonicalize(b.ingredient_name);
      if (canonical) bomNames.add(canonical);
    }

    // 從 items 拉名稱（有些食材可能 BOM 沒用過，但採購端有 SKU）
    const itemNames = new Set<string>();
    for (const it of itemRows) {
      const canonical = canonicalize(it.name);
      if (canonical) itemNames.add(canonical);
    }

    // 聯集：BOM 用過的 + items 有的（不排除沒 BOM 用的，方便食材中心展示）
    const allNames = new Set<string>([...bomNames, ...itemNames]);
    console.log(`   BOM 拉出 ${bomNames.size} 種`);
    console.log(`   items 拉出 ${itemNames.size} 種`);
    console.log(`   聯集 = ${allNames.size} 種 ingredient`);

    // 推斷每個 ingredient 的 category + unit（用最常見的 item 屬性）
    interface IngredientPlan {
      name: string;
      category: string;
      unit: string;
      sampleItemIds: number[];
    }
    const plans = new Map<string, IngredientPlan>();
    for (const name of allNames) {
      // 找 items 中 canonicalize(name) === ingredientName 的 sample
      const samples = itemRows.filter((it) => canonicalize(it.name) === name);
      const category = samples[0]?.category ?? "雜項";
      const unit = samples[0]?.unit ?? "份";
      plans.set(name, {
        name,
        category,
        unit,
        sampleItemIds: samples.map((s) => s.id),
      });
    }

    // ── Step 2: INSERT INTO ingredients ──
    console.log("\nStep 2: INSERT ingredients...");

    if (APPLY) {
      await client.begin(async (tx) => {
        let createdCount = 0;
        let skipCount = 0;
        for (const plan of plans.values()) {
          const result = await tx`
            INSERT INTO ingredients (name, category, unit)
            VALUES (${plan.name}, ${plan.category}, ${plan.unit})
            ON CONFLICT (name) DO NOTHING
            RETURNING id
          ` as unknown as Array<{ id: number }>;
          if (result.length > 0) createdCount++;
          else skipCount++;
        }
        console.log(`   ✓ 新建 ${createdCount} 個 ingredient（${skipCount} 個已存在跳過）`);
      });
    } else {
      console.log(`   [dry-run] 會建 ${plans.size} 個 ingredient`);
      const sample = Array.from(plans.values()).slice(0, 10);
      console.log("   前 10 個範例：");
      for (const p of sample) {
        console.log(`     ${p.name.padEnd(20)} [${p.category}] ${p.unit}  (${p.sampleItemIds.length} 家供應商)`);
      }
    }

    // ── Step 3+4+5+6 — 只在 APPLY 模式跑（DRY-RUN 印 plan 就停）──
    if (!APPLY) {
      console.log("\n[dry-run] 後續步驟 3-6 略過。確認 plan 後加 --apply 執行。");
      return;
    }

    // 重新 fetch ingredients（拿剛建好的 id）
    const ingredients = await client`SELECT id, name FROM ingredients` as unknown as Array<{ id: number; name: string }>;
    const nameToIngId = new Map(ingredients.map((i) => [i.name, i.id]));
    console.log(`   ✓ DB 共 ${ingredients.length} 個 ingredient`);

    // ── Step 3: 對齊 items.ingredient_id ──
    console.log("\nStep 3: 對齊 items.ingredient_id...");
    await client.begin(async (tx) => {
      let linkedCount = 0;
      let unmatchedCount = 0;
      const unmatched: string[] = [];
      for (const it of itemRows) {
        const canonical = canonicalize(it.name);
        const ingId = nameToIngId.get(canonical);
        if (!ingId) {
          unmatchedCount++;
          if (unmatched.length < 5) unmatched.push(it.name);
          continue;
        }
        await tx`UPDATE items SET ingredient_id = ${ingId} WHERE id = ${it.id}`;
        linkedCount++;
      }
      console.log(`   ✓ 對齊 ${linkedCount} 個 item（${unmatchedCount} 個沒對到）`);
      if (unmatched.length) console.log(`     範例：${unmatched.join(", ")}`);
    });

    // ── Step 4: 對齊 bom_items.ingredient_id ──
    console.log("\nStep 4: 對齊 bom_items.ingredient_id...");
    await client.begin(async (tx) => {
      let linkedCount = 0;
      let unmatchedCount = 0;
      const unmatched: string[] = [];
      for (const b of bomRows) {
        const canonical = canonicalize(b.ingredient_name);
        const ingId = nameToIngId.get(canonical);
        if (!ingId) {
          unmatchedCount++;
          if (unmatched.length < 5) unmatched.push(b.ingredient_name);
          continue;
        }
        await tx`UPDATE bom_items SET ingredient_id = ${ingId} WHERE id = ${b.id}`;
        linkedCount++;
      }
      console.log(`   ✓ 對齊 ${linkedCount} 筆 BOM（${unmatchedCount} 筆沒對到）`);
      if (unmatched.length) console.log(`     範例：${unmatched.join(", ")}`);
    });

    // ── Step 5: 標 is_primary（每個 ingredient 取 cost_price > 0 最低的 item）──
    console.log("\nStep 5: 標 is_primary...");
    await client.begin(async (tx) => {
      // 先全清
      await tx`UPDATE items SET is_primary = false`;
      // 對每個 ingredient，取 cost_price > 0 最低的 item 設 primary
      const updated = await tx`
        WITH primary_choices AS (
          SELECT DISTINCT ON (ingredient_id) id, ingredient_id, name, cost_price
          FROM items
          WHERE ingredient_id IS NOT NULL
            AND is_active = true
            AND cost_price > 0
          ORDER BY ingredient_id, cost_price ASC, id ASC
        )
        UPDATE items SET is_primary = true
        WHERE id IN (SELECT id FROM primary_choices)
        RETURNING id, name
      ` as unknown as Array<{ id: number; name: string }>;
      console.log(`   ✓ 標 ${updated.length} 個 ingredient 的主供應商`);
    });

    // ── Step 6: 拆 BOM.quantity 字串 ──
    console.log("\nStep 6: 拆 BOM.quantity 字串...");
    await client.begin(async (tx) => {
      let parsedCount = 0;
      let unparsedCount = 0;
      const unparsedSamples: string[] = [];
      for (const b of bomRows) {
        const { value, unit } = parseQuantity(b.quantity);
        if (value === null) {
          unparsedCount++;
          if (unparsedSamples.length < 10) unparsedSamples.push(b.quantity);
          continue;
        }
        await tx`
          UPDATE bom_items
          SET quantity_value = ${value}, quantity_unit = ${unit}
          WHERE id = ${b.id}
        `;
        parsedCount++;
      }
      console.log(`   ✓ 拆出 ${parsedCount} 筆（${unparsedCount} 筆拆不出）`);
      if (unparsedSamples.length) {
        console.log(`     拆不出範例：${unparsedSamples.slice(0, 10).join(" | ")}`);
      }
    });

    // ── 驗證 ──
    console.log("\n=== 驗證 ===");
    const [ingCount] = await client`SELECT COUNT(*)::int as c FROM ingredients` as unknown as Array<{ c: number }>;
    const [itemsLinked] = await client`SELECT COUNT(*)::int as c FROM items WHERE ingredient_id IS NOT NULL` as unknown as Array<{ c: number }>;
    const [itemsTotal] = await client`SELECT COUNT(*)::int as c FROM items WHERE is_active = true` as unknown as Array<{ c: number }>;
    const [bomLinked] = await client`SELECT COUNT(*)::int as c FROM bom_items WHERE ingredient_id IS NOT NULL` as unknown as Array<{ c: number }>;
    const [bomTotal] = await client`SELECT COUNT(*)::int as c FROM bom_items` as unknown as Array<{ c: number }>;
    const [primaryCount] = await client`SELECT COUNT(*)::int as c FROM items WHERE is_primary = true` as unknown as Array<{ c: number }>;
    const [qtyParsed] = await client`SELECT COUNT(*)::int as c FROM bom_items WHERE quantity_value IS NOT NULL` as unknown as Array<{ c: number }>;

    console.log(`   ingredients:         ${ingCount.c} 個`);
    console.log(`   items 已關聯:        ${itemsLinked.c} / ${itemsTotal.c} (${((itemsLinked.c / itemsTotal.c) * 100).toFixed(1)}%)`);
    console.log(`   BOM 已關聯:          ${bomLinked.c} / ${bomTotal.c} (${((bomLinked.c / bomTotal.c) * 100).toFixed(1)}%)`);
    console.log(`   主供應商已標:        ${primaryCount.c} 個 ingredient`);
    console.log(`   BOM quantity 已拆:   ${qtyParsed.c} / ${bomTotal.c} (${((qtyParsed.c / bomTotal.c) * 100).toFixed(1)}%)`);

    console.log("\n✅ Seed 完成");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Seed 失敗:", err);
  process.exit(1);
});
