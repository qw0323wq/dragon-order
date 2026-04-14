/**
 * 套用綠盛 4/16-4/30 報價單變動到 DB
 *
 * 動作（單一 transaction）：
 *   1. 建立 14 筆 price-schedule 排程（pending, effective_date=2026-04-16）
 *   2. 3 筆品項 is_active=false（綠盛本期不供應）
 *   3. 品項改名「烏蛋」→「鳥蛋」
 *
 * 冪等：重複執行不會重複建排程、不會錯誤改名
 *
 * 使用：npx tsx scripts/apply-lvsheng-schedule.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const EFFECTIVE_DATE = '2026-04-16';
const SOURCE = '綠盛 4/16-4/30 報價單';

// 14 筆排程
const SCHEDULES: { itemId: number; newPrice: number; name: string }[] = [
  { itemId: 215, newPrice: 57, name: '大陸妹' },
  { itemId: 233, newPrice: 95, name: '巴西里' },
  { itemId: 116, newPrice: 75, name: '小黃瓜' },
  { itemId: 232, newPrice: 105, name: '奶油白菜' },
  { itemId: 222, newPrice: 45, name: '牛番茄' },
  { itemId: 223, newPrice: 36, name: '南瓜' },
  { itemId: 33, newPrice: 40, name: '娃娃菜' },
  { itemId: 237, newPrice: 105, name: '香菜' },
  { itemId: 214, newPrice: 24, name: '高麗菜' },
  { itemId: 242, newPrice: 78, name: '生豆包' },
  { itemId: 45, newPrice: 25, name: '玉米筍' },
  { itemId: 228, newPrice: 87, name: '鴻喜菇' },
  { itemId: 49, newPrice: 100, name: '小香菇' },
  { itemId: 225, newPrice: 19, name: '黃豆芽' },
];

// 3 筆停用
const DEACTIVATE: { itemId: number; name: string }[] = [
  { itemId: 226, name: 'A菜心' },
  { itemId: 217, name: '山茼蒿（綠盛）' },
  { itemId: 119, name: '大豆苗' },
];

// 改名
const RENAME = { itemId: 259, oldName: '烏蛋', newName: '鳥蛋' };

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  console.log('🔌 連線...\n');

  let scheduleCreated = 0;
  let scheduleSkipped = 0;
  let deactivated = 0;
  let alreadyInactive = 0;
  let renamed = false;

  try {
    await sql.begin(async (tx) => {
      // 1. 建排程
      console.log('📅 [1/3] 建立 price-schedule 排程');
      console.log('────────────────────────────────────────');
      for (const s of SCHEDULES) {
        const existing = await tx`
          SELECT id FROM scheduled_price_changes
          WHERE item_id = ${s.itemId}
            AND effective_date = ${EFFECTIVE_DATE}
            AND status = 'pending'
        `;
        if (existing.length > 0) {
          console.log(`  ⏭️  ${s.name.padEnd(6, '　')} — 已有 pending 排程 #${existing[0].id}，跳過`);
          scheduleSkipped++;
          continue;
        }
        const [row] = await tx`
          INSERT INTO scheduled_price_changes
            (item_id, new_cost_price, effective_date, source, status)
          VALUES
            (${s.itemId}, ${s.newPrice}, ${EFFECTIVE_DATE}, ${SOURCE}, 'pending')
          RETURNING id
        `;
        console.log(`  ✅ ${s.name.padEnd(6, '　')} → $${s.newPrice}（排程 #${row.id}，生效 ${EFFECTIVE_DATE}）`);
        scheduleCreated++;
      }

      // 2. 停用 3 筆
      console.log('\n🚫 [2/3] 停用不供應品項');
      console.log('────────────────────────────────────────');
      for (const d of DEACTIVATE) {
        const result = await tx`
          UPDATE items SET is_active = false
          WHERE id = ${d.itemId} AND is_active = true
        `;
        if (result.count > 0) {
          console.log(`  ✅ ${d.name.padEnd(10, '　')} — is_active=false`);
          deactivated++;
        } else {
          console.log(`  ⏭️  ${d.name.padEnd(10, '　')} — 已是停用，跳過`);
          alreadyInactive++;
        }
      }

      // 3. 改名
      console.log('\n✏️  [3/3] 品項改名');
      console.log('────────────────────────────────────────');
      const rnResult = await tx`
        UPDATE items SET name = ${RENAME.newName}
        WHERE id = ${RENAME.itemId} AND name = ${RENAME.oldName}
      `;
      if (rnResult.count > 0) {
        console.log(`  ✅ #${RENAME.itemId}「${RENAME.oldName}」→「${RENAME.newName}」`);
        renamed = true;
      } else {
        console.log(`  ⏭️  #${RENAME.itemId} 現名已非「${RENAME.oldName}」，跳過改名`);
      }
    });
  } catch (e) {
    console.error('\n❌ Transaction 失敗，已 rollback：', e);
    await sql.end();
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════');
  console.log('🎉 全部完成');
  console.log('════════════════════════════════════════');
  console.log(`  排程建立：${scheduleCreated} 筆（跳過 ${scheduleSkipped}）`);
  console.log(`  品項停用：${deactivated} 筆（已停用 ${alreadyInactive}）`);
  console.log(`  品名變更：${renamed ? '1 筆' : '跳過'}`);
  console.log('');
  console.log('👉 下一步：');
  console.log('  1. 到後台 /dashboard/price-schedule 檢查排程');
  console.log('  2. commit + push + Vercel 部署，才能讓 cron 跑起來');
  console.log('  3. 4/16 清晨 05:00 台北時間 cron 自動套用新價');
  console.log('');

  await sql.end();
}

main().catch((e) => {
  console.error('❌ 執行失敗:', e);
  process.exit(1);
});
