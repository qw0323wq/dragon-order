/**
 * Drizzle Kit 設定
 *
 * 使用方式：
 *   npx drizzle-kit generate   — 產生 migration SQL
 *   npx drizzle-kit migrate    — 執行 migration
 *   npx drizzle-kit push       — 直接推送 schema（開發用）
 *   npx drizzle-kit studio     — 開啟 Drizzle Studio 瀏覽資料
 *
 * CRITICAL: 正式環境改 schema 必須用 generate + migrate，禁止直接 push
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // CRITICAL: DATABASE_URL 必須在 .env.local 設定
    url: process.env.DATABASE_URL!,
  },
});
