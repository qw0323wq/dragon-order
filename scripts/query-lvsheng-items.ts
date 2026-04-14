/**
 * 查詢綠盛所有品項的當前價格
 * 用途：準備 4/16 報價比對用
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  const [supplier] = await sql`
    SELECT id, name, code FROM suppliers
    WHERE name LIKE '%綠盛%' OR code LIKE 'LS%'
    ORDER BY id LIMIT 1
  `;

  if (!supplier) {
    console.error('❌ 找不到綠盛供應商');
    process.exit(1);
  }

  console.log(`\n📦 供應商：${supplier.name}（ID=${supplier.id}, code=${supplier.code}）\n`);

  const items = await sql`
    SELECT id, sku, name, unit, cost_price, store_price, is_active
    FROM items
    WHERE supplier_id = ${supplier.id}
    ORDER BY is_active DESC, name
  `;

  console.log(`共 ${items.length} 個品項\n`);
  console.log('ID  | SKU      | 品名                          | 單位  | 進價  | 店家價 | 停用');
  console.log('----+----------+-------------------------------+-------+-------+--------+------');

  for (const it of items) {
    const name = String(it.name).padEnd(28, ' ');
    const unit = String(it.unit || '').padEnd(4, ' ');
    const cost = String(it.cost_price).padStart(4, ' ');
    const store = String(it.store_price || '-').padStart(5, ' ');
    const inactive = it.is_active ? '' : '🚫';
    console.log(
      `${String(it.id).padEnd(3)} | ${String(it.sku || '').padEnd(8)} | ${name} | ${unit} | ${cost} | ${store} | ${inactive}`
    );
  }

  console.log(`\n📋 待用：貼報價時對照這份清單建排程`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
