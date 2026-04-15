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
// CRITICAL: types.numeric 自訂 parser — postgres.js 預設把 numeric 回成 string（避 JS number 精度），
//   但本系統金額用 numeric(10,2) < 8 位數，安全在 JS number 範圍內，
//   parseFloat 後 raw SQL / Drizzle 回的 numeric 統一是 number type，
//   下游 sumBy / formatCurrency / 比較運算都不會踩雷。
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  types: {
    numeric: {
      to: 1700, // PG type OID for numeric
      from: [1700],
      parse: (value: string) => parseFloat(value),
      serialize: (value: number) => String(value),
    },
  },
});

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
