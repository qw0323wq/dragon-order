/**
 * 以曜 4-5 月份報價調整（單一 transaction）
 *
 * Q1 — 2 筆排程，effective_date=2026-04-20：
 *   #5 牛五花         $220 → $235 (+$15)
 *   #7 CH板腱牛       $400 → $440 (+$40)
 *   (#10 紐澳重組牛舌已有排程 #2，跳過不重複)
 *
 * Q2 — 2 個新建品項：
 *   MT-XXX 美國背肩 CH (公斤) $400
 *   MT-XXX 美國無骨牛小排(EXCEL) CH (公斤) $980  (EXCEL 是品牌名)
 *
 * 用法：npx tsx scripts/apply-yiyao-2026-04-20.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const SUPPLIER_ID = 3;  // 以曜 (MT-02)
const EFFECTIVE_DATE = '2026-04-20';
const SOURCE = '以曜 4-5月份報價單 (115年5月)';

// 排程
const SCHEDULES: { itemId: number; newPrice: number; name: string }[] = [
  { itemId: 5, newPrice: 235, name: '牛五花' },
  { itemId: 7, newPrice: 440, name: 'CH板腱牛' },
];

// 新建品項（cost_price 是 numeric，傳 number 即可）
const NEW_ITEMS: {
  name: string;
  category: string;
  unit: string;
  costPrice: number;
  aliases: string[];
  supplierNotes: string | null;
}[] = [
  {
    name: '美國背肩CH（以曜）',
    category: '肉品',
    unit: '公斤',
    costPrice: 400,
    aliases: ['美國背肩', '背肩'],
    supplierNotes: '報價單原名：美國背肩 等級 CH（國外漲幅大，持續上漲）',
  },
  {
    name: '美國無骨牛小排CH（以曜）',
    category: '肉品',
    unit: '公斤',
    costPrice: 980,
    aliases: ['美國無骨牛小排', '無骨牛小排', '牛小排'],
    supplierNotes: '報價單原名：美國無骨牛小排(EXCEL) 等級 CH（EXCEL 是品牌名 — 美國三大廠之一）',
  },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  console.log('🔌 連線\n');

  let scheduleCreated = 0;
  let scheduleSkipped = 0;
  let itemCreated = 0;
  let itemSkipped = 0;

  try {
    await sql.begin(async (tx) => {
      // ── Q1: 排程 ──
      console.log('📅 [1/2] 建立 4/20 排程');
      console.log('────────────────────────────────────────');
      for (const s of SCHEDULES) {
        const existing = await tx`
          SELECT id FROM scheduled_price_changes
          WHERE item_id = ${s.itemId}
            AND effective_date = ${EFFECTIVE_DATE}
            AND status = 'pending'
        `;
        if (existing.length > 0) {
          console.log(`  ⏭️  ${s.name.padEnd(10, '　')} — 已有 pending #${existing[0].id}`);
          scheduleSkipped++;
          continue;
        }
        const [row] = await tx`
          INSERT INTO scheduled_price_changes
            (item_id, new_cost_price, effective_date, source, status)
          VALUES (${s.itemId}, ${s.newPrice}, ${EFFECTIVE_DATE}, ${SOURCE}, 'pending')
          RETURNING id
        `;
        console.log(`  ✅ ${s.name.padEnd(10, '　')} → $${s.newPrice}（排程 #${row.id}）`);
        scheduleCreated++;
      }

      // ── Q2: 新建品項（動態 SKU）──
      console.log('\n🆕 [2/2] 新建以曜品項');
      console.log('────────────────────────────────────────');

      // 找以曜目前最大 MT- 編號
      const maxRow = await tx`
        SELECT sku FROM items
        WHERE sku ~ '^MT-[0-9]+$'
        ORDER BY sku DESC LIMIT 1
      `;
      let nextNum = 1;
      if (maxRow.length > 0) {
        const m = String(maxRow[0].sku).match(/-(\d+)$/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      }

      for (const it of NEW_ITEMS) {
        let sku = `MT-${String(nextNum).padStart(3, '0')}`;
        // 跳過已用
        while (true) {
          const dup = await tx`SELECT id FROM items WHERE sku = ${sku}`;
          if (dup.length === 0) break;
          nextNum++;
          sku = `MT-${String(nextNum).padStart(3, '0')}`;
        }
        nextNum++;

        const [row] = await tx`
          INSERT INTO items
            (sku, name, category, unit, cost_price, sell_price, supplier_id,
             aliases, supplier_notes, is_active)
          VALUES
            (${sku}, ${it.name}, ${it.category}, ${it.unit}, ${it.costPrice}, 0,
             ${SUPPLIER_ID}, ${it.aliases}, ${it.supplierNotes}, true)
          RETURNING id
        `;
        console.log(
          `  ✅ #${String(row.id).padEnd(4)} | ${sku} | ${it.name.padEnd(20, '　')} | ${it.unit.padEnd(4)} | $${it.costPrice}`
        );
        itemCreated++;
      }
    });
  } catch (e) {
    console.error('\n❌ Transaction rollback：', e);
    await sql.end();
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════');
  console.log('🎉 完成');
  console.log('════════════════════════════════════════');
  console.log(`  排程：${scheduleCreated} 建 / ${scheduleSkipped} 跳過`);
  console.log(`  新品：${itemCreated} 建 / ${itemSkipped} 跳過`);
  console.log('');
  console.log(`  📅 4/20 05:00 GitHub Actions 自動套用：`);
  console.log(`     - 牛五花 $220→$235`);
  console.log(`     - CH板腱牛 $400→$440`);
  console.log(`     - 紐澳重組牛舌 $580→$590（之前 4/14 建的 #2）`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
