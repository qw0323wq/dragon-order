/**
 * 韓流月報價：滷煮 5 項處理
 *
 * 重啟舊紀錄（同部位，名稱完全相符）：
 *  - 滷牛筋 ($54/公斤 停) → 改 $450 + 巴拉圭（保留 unit 公斤）
 *  - 滷牛腱 ($70/份 停)   → 改 $585 + 改 unit「份」→「公斤」+ 巴拉圭
 *  - 滷雞腳 ($32/公斤 停) → 改 $270 + 台灣
 *
 * 新增（部位不同，不重用舊紀錄）：
 *  - 滷蜂巢肚（韓流） $510/公斤 巴拉圭
 *  - 滷大腸頭（韓流） $536/公斤 荷蘭
 *
 * 不動：滷牛肚（停用）、滷肥腸（停用）— 部位不同保留歷史紀錄
 *
 * 用法：npx tsx scripts/apply-hanliu-stewed-0507.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

const SOURCE = '韓流月報價 2026-05';

interface ReviveSpec {
  name: string;
  newCost: number;
  newUnit?: string;     // 不填 = 保留原 unit
  notes: string;        // supplier_notes
}

interface NewItemSpec {
  name: string;
  cost: number;
  unit: string;
  notes: string;
  category: string;
  aliases: string[];
}

const REVIVE: ReviveSpec[] = [
  { name: '滷牛筋', newCost: 450, notes: '產地：巴拉圭（已切）' },
  { name: '滷牛腱', newCost: 585, newUnit: '公斤', notes: '產地：巴拉圭' },
  { name: '滷雞腳', newCost: 270, notes: '產地：台灣' },
];

const NEW_ITEMS: NewItemSpec[] = [
  {
    name: '滷蜂巢肚（韓流）',
    cost: 510,
    unit: '公斤',
    notes: '產地：巴拉圭（已切）',
    category: '滷煮',
    aliases: ['滷蜂巢肚', '蜂巢肚', '金錢肚'],
  },
  {
    name: '滷大腸頭（韓流）',
    cost: 536,
    unit: '公斤',
    notes: '產地：荷蘭（客製化切）',
    category: '滷煮',
    aliases: ['滷大腸頭', '大腸頭'],
  },
];

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });
  try {
    const [supplier] = await db
      .select()
      .from(schema.suppliers)
      .where(eq(schema.suppliers.name, '韓流'));
    if (!supplier) throw new Error('找不到供應商「韓流」');

    await client.begin(async (tx) => {
      // ── 重啟 3 項 ──
      console.log('=== 重啟既有停用紀錄 ===');
      for (const r of REVIVE) {
        const [item] = await tx`
          SELECT id, name, cost_price, unit, is_active
          FROM items WHERE supplier_id = ${supplier.id} AND name = ${r.name}
        ` as unknown as Array<{ id: number; name: string; cost_price: number; unit: string; is_active: boolean }>;
        if (!item) {
          console.log(`  ❓ DB 找不到「${r.name}」，跳過`);
          continue;
        }
        const oldCost = Number(item.cost_price);
        const oldUnit = item.unit;
        const finalUnit = r.newUnit ?? oldUnit;

        // 重啟 + 改價 + 改 unit + 改 notes
        await tx`
          UPDATE items
          SET cost_price = ${r.newCost},
              unit = ${finalUnit},
              supplier_notes = ${r.notes},
              is_active = true
          WHERE id = ${item.id}
        `;

        // 寫 price_history
        const diff = r.newCost - oldCost;
        const pct = oldCost > 0 ? ((diff / oldCost) * 100).toFixed(2) : '0';
        await tx`
          INSERT INTO item_price_history
            (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
          VALUES
            (${item.id}, ${oldCost}, ${r.newCost}, ${diff}, ${pct}, ${finalUnit},
             CURRENT_DATE, ${SOURCE})
        `;
        const unitChg = oldUnit !== finalUnit ? ` (unit ${oldUnit} → ${finalUnit})` : '';
        console.log(`  ✓ ${r.name.padEnd(12)} $${oldCost} → $${r.newCost} (+$${diff}) ${unitChg} 📝 ${r.notes}`);
      }

      // ── 新增 2 項 ──
      console.log('\n=== 新增品項 ===');
      for (const n of NEW_ITEMS) {
        // 檢查是否已存在（同名 + 同 supplier）
        const [exists] = await tx`
          SELECT id FROM items WHERE supplier_id = ${supplier.id} AND name = ${n.name}
        ` as unknown as Array<{ id: number }>;
        if (exists) {
          console.log(`  ℹ「${n.name}」已存在 (id=${exists.id})，跳過新增`);
          continue;
        }
        const [created] = await tx`
          INSERT INTO items
            (name, category, supplier_id, unit, cost_price, store_price, sell_price,
             aliases, supplier_notes, is_active)
          VALUES
            (${n.name}, ${n.category}, ${supplier.id}, ${n.unit}, ${n.cost},
             0, 0, ${n.aliases as unknown as string[]}, ${n.notes}, true)
          RETURNING id, name
        ` as unknown as Array<{ id: number; name: string }>;
        console.log(`  ✓ 新增「${n.name}」(id=${created.id}) $${n.cost}/${n.unit} 📝 ${n.notes}`);

        // 寫 price_history（建立紀錄）
        await tx`
          INSERT INTO item_price_history
            (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
          VALUES
            (${created.id}, 0, ${n.cost}, ${n.cost}, 0, ${n.unit},
             CURRENT_DATE, ${SOURCE + ' (新增)'})
        `;
      }
    });

    console.log('\n✅ 完成');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ 失敗：', err);
  process.exit(1);
});
