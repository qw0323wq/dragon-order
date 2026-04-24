/**
 * P0 修復 #3：FK onDelete 約束調整（單一 transaction）
 *
 * 1. order_items.order_id → orders.id  SET CASCADE（刪單連帶刪明細）
 * 2. receiving.order_item_id → order_items.id  SET CASCADE（刪明細連帶刪驗收）
 * 3. payments.order_id → orders.id  SET CASCADE（刪單連帶刪付款紀錄）
 * 4. store_inventory.item_id → items.id  CASCADE → RESTRICT（防誤刪品項連帶殺庫存）
 *
 * 冪等：重跑安全（先查現有 constraint name 再 drop）
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  types: { numeric: { to: 1700, from: [1700], parse: parseFloat, serialize: String } } as any,
});

type FkChange = {
  table: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
  purpose: string;
};

const CHANGES: FkChange[] = [
  { table: 'order_items', column: 'order_id', refTable: 'orders', refColumn: 'id', onDelete: 'CASCADE', purpose: '刪單連帶刪明細' },
  { table: 'receiving', column: 'order_item_id', refTable: 'order_items', refColumn: 'id', onDelete: 'CASCADE', purpose: '刪明細連帶刪驗收' },
  { table: 'payments', column: 'order_id', refTable: 'orders', refColumn: 'id', onDelete: 'CASCADE', purpose: '刪單連帶刪付款紀錄' },
  { table: 'store_inventory', column: 'item_id', refTable: 'items', refColumn: 'id', onDelete: 'RESTRICT', purpose: '防誤刪品項連帶殺庫存' },
];

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  P0-3 FK onDelete migration');
  console.log('═══════════════════════════════════════\n');

  let changed = 0;
  let alreadyCorrect = 0;

  try {
    await sql.begin(async (tx) => {
      for (const c of CHANGES) {
        // 查現有 constraint 的 delete_rule
        const existing = await tx`
          SELECT tc.constraint_name, rc.delete_rule
          FROM information_schema.table_constraints tc
          JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = ${c.table}
            AND kcu.column_name = ${c.column}
            AND tc.constraint_type = 'FOREIGN KEY'
        `;

        if (existing.length === 0) {
          console.log(`  ⚠️  ${c.table}.${c.column} FK 不存在，跳過`);
          continue;
        }

        const constraintName = String(existing[0].constraint_name);
        const currentRule = String(existing[0].delete_rule); // NO ACTION / CASCADE / RESTRICT / SET NULL
        const targetRule = c.onDelete;

        if (currentRule === targetRule) {
          console.log(`  ⏭️  ${c.table}.${c.column} 已是 ${targetRule}，跳過`);
          alreadyCorrect++;
          continue;
        }

        // drop + recreate with new rule
        await tx.unsafe(`ALTER TABLE "${c.table}" DROP CONSTRAINT "${constraintName}"`);
        await tx.unsafe(`
          ALTER TABLE "${c.table}"
          ADD CONSTRAINT "${constraintName}"
          FOREIGN KEY ("${c.column}")
          REFERENCES "${c.refTable}"("${c.refColumn}")
          ON DELETE ${targetRule}
        `);

        console.log(`  ✅ ${c.table}.${c.column} → ${c.refTable}.${c.refColumn}  ${currentRule} → ${targetRule}  (${c.purpose})`);
        changed++;
      }
    });
  } catch (e) {
    console.error('\n❌ Transaction rollback：', e);
    await sql.end();
    process.exit(1);
  }

  // 驗證
  console.log('\n📊 驗證結果');
  console.log('────────────────────────────────────────');
  for (const c of CHANGES) {
    const result = await sql`
      SELECT rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = ${c.table}
        AND kcu.column_name = ${c.column}
        AND tc.constraint_type = 'FOREIGN KEY'
    `;
    const rule = result[0]?.delete_rule;
    const ok = rule === c.onDelete ? '✅' : '❌';
    console.log(`  ${ok} ${c.table}.${c.column} → ${rule}`);
  }

  console.log(`\n🎉 完成 — ${changed} 改 / ${alreadyCorrect} 已正確\n`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
