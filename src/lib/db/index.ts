/**
 * Drizzle ORM 資料庫連線 — Neon Serverless
 *
 * 使用 neon-http driver（適合 Vercel Edge / Serverless Function）
 * CRITICAL: 必須設定 DATABASE_URL 環境變數，否則所有 DB 操作會直接 throw
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// CRITICAL: DATABASE_URL 格式：postgresql://user:pass@host/db?sslmode=require
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

/** DB 實例型別，供需要傳遞 db 的函式使用 */
export type DB = typeof db;

/** 重新匯出 schema，方便其他模組 import */
export * from './schema';
