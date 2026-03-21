/**
 * 認證工具模組 — PIN + JWT
 *
 * 設計決策：
 * - PIN 用 bcryptjs hash（cost factor 10，平衡安全與速度）
 * - JWT 有效期 30 天（火鍋店老闆不需要頻繁重新登入）
 * - Cookie name 固定為 'dragon-session'
 *
 * CRITICAL: JWT_SECRET 必須設定，空字串會導致任意 token 被接受
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { RequestCookies } from 'next/dist/compiled/@edge-runtime/cookies';

// bcrypt cost factor：10 在一般機器約 100ms，足夠防爆破
const BCRYPT_ROUNDS = 10;

// CRITICAL: cookie 名稱若修改，middleware 和所有讀 cookie 的地方必須同步更新
export const SESSION_COOKIE = 'dragon-session';

/** JWT payload 型別，含最小必要資訊 */
export interface TokenPayload {
  id: number;
  name: string;
  /** 'owner' | 'manager' | 'staff' */
  role: string;
  storeId: number | null;
}

/**
 * 將 4-6 位 PIN 碼雜湊
 * @param pin 明碼 PIN（前端傳入）
 * @returns bcrypt hash 字串
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

/**
 * 驗證 PIN 碼是否符合 hash
 * @param pin 使用者輸入的 PIN
 * @param hash 資料庫存的 pinHash
 * @returns true = 正確
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/**
 * 建立 JWT session token
 * @param user 使用者基本資料（不含敏感欄位）
 * @returns 簽名後的 JWT 字串
 */
export function createToken(user: TokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // CRITICAL: 缺少 JWT_SECRET 會讓 token 無法驗證，直接阻斷
    throw new Error('JWT_SECRET 環境變數未設定');
  }
  return jwt.sign(user, secret, {
    expiresIn: '30d',
  });
}

/**
 * 驗證並解碼 JWT token
 * @param token JWT 字串
 * @returns TokenPayload 或 null（token 無效/過期）
 */
export function verifyToken(token: string): TokenPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret) as TokenPayload & {
      iat?: number;
      exp?: number;
    };
    return {
      id: payload.id,
      name: payload.name,
      role: payload.role,
      storeId: payload.storeId,
    };
  } catch {
    // token 過期或被篡改，回傳 null 讓呼叫端決定如何處理
    return null;
  }
}

/**
 * 從 Next.js Server Component 的 cookies() 取得 session
 *
 * 使用範例（Server Component）：
 * ```ts
 * import { cookies } from 'next/headers';
 * const session = getSession(await cookies());
 * if (!session) redirect('/');
 * ```
 *
 * @param cookieStore Next.js cookies() 回傳的 RequestCookies
 * @returns TokenPayload 或 null（未登入 / token 無效）
 */
export function getSession(cookieStore: RequestCookies): TokenPayload | null {
  const cookie = cookieStore.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  return verifyToken(cookie.value);
}

/**
 * 判斷 role 是否有管理權限
 * @param role TokenPayload.role
 * @returns true = owner 或 manager
 */
export function isManager(role: string): boolean {
  return role === 'owner' || role === 'manager';
}
