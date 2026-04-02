/**
 * In-memory Rate Limiter
 *
 * 用於限制特定操作的頻率（如登入嘗試）
 * Vercel Serverless 環境下每個 instance 獨立計數，
 * 無法跨 instance 共享，但仍能防止單一 instance 被暴力破解
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/** 每 5 分鐘清理過期的 entries，防止記憶體洩漏 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

/**
 * 檢查是否超過速率限制
 * @returns true = 允許通過, false = 已超限
 */
export function rateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();

  const { key, limit, windowMs } = options;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/** Login 專用常數 */
export const LOGIN_RATE_LIMIT = {
  limit: 5,
  windowMs: 15 * 60 * 1000, // 15 分鐘
} as const;
