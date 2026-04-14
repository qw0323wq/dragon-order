/**
 * 通用版：讀 preview 產出的 JSON 計畫檔，套用到 DB
 *
 * Usage:
 *   npx tsx scripts/apply-price-schedule.ts <plan.json>
 *
 * 單一 transaction：
 *   1. 建立 price-schedule 排程（pending, effective_date 由 plan 指定）
 *   2. （可選）依 plan.deactivate 標記品項 is_active=false
 *
 * 冪等：已有同 item_id + 同 effective_date 的 pending 排程時跳過
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs';
import postgres from 'postgres';

type Plan = {
  supplier: { id: number; code: string; name: string };
  effectiveDate: string;
  source: string;
  schedules: {
    itemId: number;
    name: string;
    sku: string;
    unit: string;
    oldPrice: number;
    newPrice: number;
    diff: number;
    notes: string | null;
  }[];
  deactivate?: {
    excelName: string;
    excelUnit: string | null;
    notes: string | null;
    itemId?: number; // 人工補上才處理
  }[];
};

const planFile = process.argv[2];
if (!planFile) {
  console.error('用法: npx tsx scripts/apply-price-schedule.ts <plan.json>');
  process.exit(1);
}
if (!fs.existsSync(planFile)) {
  console.error(`❌ 找不到計畫檔：${planFile}`);
  process.exit(1);
}

const plan: Plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));

async function main() {
  console.log(`\n📋 套用計畫：${planFile}`);
  console.log(`   供應商：${plan.supplier.name} (${plan.supplier.code})`);
  console.log(`   生效日：${plan.effectiveDate}`);
  console.log(`   來源：${plan.source}`);
  console.log(`   排程：${plan.schedules.length} 筆`);

  const deactivateList = (plan.deactivate ?? []).filter((d) => d.itemId);
  if (deactivateList.length > 0) {
    console.log(`   停用：${deactivateList.length} 筆（已指定 itemId）`);
  }
  console.log();

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  let created = 0;
  let skipped = 0;
  let deactivated = 0;

  try {
    await sql.begin(async (tx) => {
      console.log('📅 [1/2] 建立排程');
      console.log('────────────────────────────────────────');
      for (const s of plan.schedules) {
        const existing = await tx`
          SELECT id FROM scheduled_price_changes
          WHERE item_id = ${s.itemId}
            AND effective_date = ${plan.effectiveDate}
            AND status = 'pending'
        `;
        if (existing.length > 0) {
          console.log(`  ⏭️  ${s.name.padEnd(10, '　')} — 已有 pending #${existing[0].id}`);
          skipped++;
          continue;
        }
        const [row] = await tx`
          INSERT INTO scheduled_price_changes
            (item_id, new_cost_price, effective_date, source, status)
          VALUES (${s.itemId}, ${s.newPrice}, ${plan.effectiveDate}, ${plan.source}, 'pending')
          RETURNING id
        `;
        console.log(`  ✅ ${s.name.padEnd(10, '　')} $${s.oldPrice}→$${s.newPrice}（#${row.id}）`);
        created++;
      }

      if (deactivateList.length > 0) {
        console.log('\n🚫 [2/2] 停用指定品項');
        console.log('────────────────────────────────────────');
        for (const d of deactivateList) {
          const result = await tx`
            UPDATE items SET is_active = false WHERE id = ${d.itemId!} AND is_active = true
          `;
          if (result.count > 0) {
            console.log(`  ✅ #${d.itemId} ${d.excelName} 停用`);
            deactivated++;
          } else {
            console.log(`  ⏭️  #${d.itemId} ${d.excelName} 已是停用`);
          }
        }
      }
    });
  } catch (e) {
    console.error('\n❌ Transaction rollback:', e);
    await sql.end();
    process.exit(1);
  }

  console.log('\n════════════════════════════════════════');
  console.log(`🎉 完成 — 建 ${created} 筆 / 跳過 ${skipped} 筆 / 停用 ${deactivated} 筆`);
  console.log('════════════════════════════════════════\n');

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
