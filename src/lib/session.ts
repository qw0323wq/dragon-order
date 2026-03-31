/**
 * Session 簽名工具 — HMAC-SHA256
 *
 * 解決問題：Cookie 原本存明文 JSON，任何人可以改 role 偽裝管理員
 * 解法：用 HMAC 簽名，讀取時驗證沒被竄改
 *
 * Cookie 格式：base64(json).signature
 * Edge Runtime 相容（不用 jsonwebtoken）
 */

import { createHmac } from "crypto";

const SECRET = process.env.JWT_SECRET || "dragon-order-default-secret";

/** 簽名：JSON → base64.signature */
export function signSession(data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** 驗證 + 解析：base64.signature → JSON | null */
export function verifySession<T = unknown>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");

  if (sig !== expected) return null; // 被竄改

  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
