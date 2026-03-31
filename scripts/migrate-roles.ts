/**
 * 遷移腳本：角色系統升級
 *
 * 1. 現有 owner → admin
 * 2. 為現有使用者補上 employeeId（用 id 作為編號）
 * 3. 插入預設 role_permissions
 *
 * 執行：npx tsx scripts/migrate-roles.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, isNull } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { DEFAULT_PERMISSIONS } from '../src/lib/permissions';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function main() {
  console.log('🔄 開始角色系統遷移...\n');

  // Step 1: owner → admin
  const ownerUsers = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.role, 'owner'));

  if (ownerUsers.length > 0) {
    await db
      .update(schema.users)
      .set({ role: 'admin' })
      .where(eq(schema.users.role, 'owner'));
    console.log(`✅ ${ownerUsers.length} 個 owner → admin：`);
    ownerUsers.forEach((u) => console.log(`   - ${u.name} (id: ${u.id})`));
  } else {
    console.log('ℹ️  沒有 owner 需要轉換');
  }

  // Step 2: 為沒有 employeeId 的使用者補上（用 E + id 格式）
  const allUsers = await db.select().from(schema.users);
  let updated = 0;
  for (const user of allUsers) {
    if (!user.employeeId) {
      const eid = `E${String(user.id).padStart(3, '0')}`;
      await db
        .update(schema.users)
        .set({ employeeId: eid })
        .where(eq(schema.users.id, user.id));
      console.log(`✅ ${user.name} → 員工編號 ${eid}`);
      updated++;
    }
  }
  if (updated === 0) {
    console.log('ℹ️  所有使用者都已有員工編號');
  }

  // Step 3: 插入預設 role_permissions
  for (const [role, pages] of Object.entries(DEFAULT_PERMISSIONS)) {
    const [existing] = await db
      .select()
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.role, role))
      .limit(1);

    if (!existing) {
      await db.insert(schema.rolePermissions).values({
        role,
        allowedPages: pages,
        updatedAt: new Date(),
      });
      console.log(`✅ 新增角色權限：${role} → [${pages.join(', ')}]`);
    } else {
      console.log(`ℹ️  角色 ${role} 權限已存在，跳過`);
    }
  }

  // 顯示最終狀態
  console.log('\n📋 最終使用者列表：');
  const finalUsers = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      employeeId: schema.users.employeeId,
      role: schema.users.role,
    })
    .from(schema.users)
    .orderBy(schema.users.id);
  finalUsers.forEach((u) => {
    console.log(`   ${u.employeeId} | ${u.name} | ${u.role}`);
  });

  console.log('\n🎉 遷移完成！');
}

main().catch(console.error);
