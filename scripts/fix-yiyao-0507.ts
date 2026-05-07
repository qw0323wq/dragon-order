/**
 * 修復 apply-quotes-0507 對以曜品項的錯誤更新
 *
 * 錯因：fuzzy match 跨欄誤對到右欄「可參考品項」（不是目前交易的）
 *  - 日本A5和牛 alias「三叉」太泛 → 被對到「美國三叉 PR/CAB 400」→ $1200 → $400
 *  - CH板腱牛 → 被對到右欄「美國板腱 CAB 560」→ $440 → $560（應為左欄 CH 460）
 *  - 美國無骨牛小排CH（以曜）→ 對到右欄 1150（左欄是同價 980，應持平）
 *
 * 步驟：
 *  1. 回滾 6 項到原價
 *  2. 刪除 source='以曜月報價 2026-05' 的 item_price_history
 *  3. 移除「三叉」alias from 日本A5和牛
 *  4. 用「明確 mapping 表」重新 apply 左欄 11 項
 *
 * 用法：npx tsx scripts/fix-yiyao-0507.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, sql as drizzleSql } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

const SOURCE = '以曜月報價 2026-05';

/**
 * 左欄目前交易品項的明確 mapping（dbName → newCost）
 * 這是 Excel 左欄的 11 項（不含右欄參考品項）
 */
const LEFT_COLUMN_MAPPING: Array<{
  dbName: string;
  newCost: number | null;     // null 表示單位不同/不更新
  newNotes: string | null;
  reason?: string;
}> = [
  { dbName: '牛五花', newCost: 235, newNotes: null },                                          // 美國牛五花 NR 235
  { dbName: 'CH板腱牛', newCost: 460, newNotes: '國外漲幅大，持續上漲' },                          // 美國板腱 CH 460
  { dbName: '美國背肩CH（以曜）', newCost: 420, newNotes: '國外漲幅大，持續上漲' },                  // 美國背肩 CH 420
  { dbName: '美國無骨牛小排CH（以曜）', newCost: 980, newNotes: '美國三大廠之一，品質穩定' },           // 美國無骨牛小排(EXCEL) CH 980
  { dbName: '澳洲和牛黃瓜條M8', newCost: null, newNotes: null, reason: '單位不同（DB 份 / 報價 KG）' }, // M8-9 460/KG
  { dbName: '紐澳重組牛舌', newCost: 625, newNotes: '宏柏代工，食品級黏著劑，添加物少，含水量低。' },     // 紐西蘭牛舌捲(重組) 625
  { dbName: '梅花豬', newCost: 250, newNotes: null },                                          // 台灣梅花豬 250
  { dbName: '台灣豬五花', newCost: 265, newNotes: null },                                       // 台灣CAS豬五花 265
  { dbName: '松阪豬', newCost: 490, newNotes: '宏柏代工，食品級黏著劑，添加物少，含水量低。' },         // 西班牙松板捲 490
  { dbName: '羊肉捲捲', newCost: 310, newNotes: '宏柏代工，食品級黏著劑，添加物少，含水量低。' },        // 紐西蘭羊五花 310
  { dbName: '日本A5和牛', newCost: 1200, newNotes: 'BMS-11~12' },                              // 日本和牛三叉 A5 1200
];

/** 之前錯誤更新的原價（從 peek-suppliers-0507 結果取得）— 用於 rollback */
const ROLLBACK_PRICES: Record<string, number> = {
  'CH板腱牛': 440,
  '美國無骨牛小排CH（以曜）': 980,
  '紐澳重組牛舌': 590,
  '羊肉捲捲': 285,
  '日本A5和牛': 1200,
  // 美國背肩CH（以曜）沒被誤對（單位不同跳過）→ 不需 rollback
};

async function run() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });
  try {
    const [supplier] = await db
      .select()
      .from(schema.suppliers)
      .where(eq(schema.suppliers.name, '以曜'));
    if (!supplier) throw new Error('找不到供應商「以曜」');

    await client.begin(async (tx) => {
      // ── 1. 刪除 source='以曜月報價 2026-05' 的 price_history ──
      const deletedHistory = await tx`
        DELETE FROM item_price_history
        WHERE source = ${SOURCE}
        RETURNING id, item_id, old_price, new_price
      ` as unknown as Array<{ id: number; item_id: number; old_price: number; new_price: number }>;
      console.log(`✓ 刪除 ${deletedHistory.length} 筆錯誤的 price_history`);

      // ── 2. 回滾 cost_price 到原價 ──
      for (const [name, oldPrice] of Object.entries(ROLLBACK_PRICES)) {
        const result = await tx`
          UPDATE items SET cost_price = ${oldPrice}
          WHERE supplier_id = ${supplier.id} AND name = ${name}
          RETURNING name, cost_price
        ` as unknown as Array<{ name: string; cost_price: number }>;
        if (result.length > 0) {
          console.log(`  ↩ rollback: ${name} → $${oldPrice}`);
        }
      }

      // ── 3. 移除「三叉」alias from 日本A5和牛 ──
      const [a5] = await tx`
        UPDATE items
        SET aliases = array_remove(aliases, '三叉')
        WHERE supplier_id = ${supplier.id} AND name = '日本A5和牛'
        RETURNING name, aliases
      ` as unknown as Array<{ name: string; aliases: string[] }>;
      if (a5) {
        console.log(`✓ 移除 alias「三叉」from 日本A5和牛 → 剩 [${(a5.aliases ?? []).join(', ')}]`);
      }
    });

    console.log('\n──── 重新套用左欄正確 mapping ────');

    // ── 4. 用明確 mapping 重新更新（不靠 fuzzy match）──
    await client.begin(async (tx) => {
      let upCount = 0, sameCount = 0, skipCount = 0;
      for (const m of LEFT_COLUMN_MAPPING) {
        const [item] = await tx`
          SELECT id, name, cost_price, supplier_notes, unit
          FROM items WHERE supplier_id = ${supplier.id} AND name = ${m.dbName}
        ` as unknown as Array<{ id: number; name: string; cost_price: number; supplier_notes: string | null; unit: string }>;
        if (!item) {
          console.log(`  ❓ DB 找不到「${m.dbName}」，跳過`);
          continue;
        }
        if (m.newCost == null) {
          console.log(`  ⏸ ${m.dbName.padEnd(28)} 跳過（${m.reason}）`);
          skipCount++;
          continue;
        }
        const oldCost = Number(item.cost_price);
        const priceChanged = oldCost !== m.newCost;
        const notesChanged = m.newNotes != null && m.newNotes !== item.supplier_notes;

        if (priceChanged) {
          await tx`UPDATE items SET cost_price = ${m.newCost} WHERE id = ${item.id}`;
          const diff = m.newCost - oldCost;
          const pct = oldCost > 0 ? ((diff / oldCost) * 100).toFixed(2) : '0';
          await tx`
            INSERT INTO item_price_history
              (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
            VALUES
              (${item.id}, ${oldCost}, ${m.newCost}, ${diff}, ${pct}, ${item.unit ?? ''},
               CURRENT_DATE, ${SOURCE})
          `;
          const noteStr = notesChanged ? ` 📝 ${m.newNotes}` : '';
          console.log(`  ⬆ ${m.dbName.padEnd(28)} $${oldCost} → $${m.newCost} (${diff > 0 ? '+' : ''}$${diff})${noteStr}`);
          upCount++;
        } else {
          console.log(`  ＝ ${m.dbName.padEnd(28)} $${oldCost}`);
          sameCount++;
        }
        if (notesChanged) {
          await tx`UPDATE items SET supplier_notes = ${m.newNotes} WHERE id = ${item.id}`;
        }
      }
      console.log(`\n📊 漲/持平/跳過：${upCount} / ${sameCount} / ${skipCount}`);
    });

    console.log('\n✅ 修復完成');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('❌ 失敗：', err);
  process.exit(1);
});
