/**
 * Drizzle ORM 資料庫連線 — Supabase PostgreSQL
 *
 * 使用 postgres.js driver（適合 Vercel Serverless + Supabase Pooler）
 * CRITICAL: 必須設定 DATABASE_URL 環境變數，否則所有 DB 操作會直接 throw
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// CRITICAL: DATABASE_URL 格式：postgresql://user:pass@host:port/db
const client = postgres(process.env.DATABASE_URL!, { prepare: false });

export const db = drizzle(client, { schema });

/**
 * 共用的 raw postgres.js client — 需要寫原生 SQL 時使用
 * CRITICAL: 所有 API route 必須用這個，不要各自 new postgres()，否則連線池爆炸
 */
export { client as rawSql };

/** DB 實例型別，供需要傳遞 db 的函式使用 */
export type DB = typeof db;

/** 重新匯出 schema，方便其他模組 import */
export * from './schema';
