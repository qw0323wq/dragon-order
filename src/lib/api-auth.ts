/**
 * API 認證工具 — 三軌認證 + 角色權限
 *
 * 認證方式（三擇一）：
 * 1. Cookie session（Web 前端用）
 * 2. 系統 API Key（全域管理用）— API_KEY_ADMIN / API_KEY_USER
 * 3. 個人 API Token（每人的 AI 助理用）— 查 users.api_token → 自動帶入身份
 *
 * 個人 token 的好處：
 * - 系統知道是「誰的 AI」在操作
 * - 權限自動跟著該使用者的 role 走
 * - 訂單自動記錄 created_by
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/session";

const SESSION_COOKIE = "dragon-session";

export type ApiRole = "admin" | "user";

interface AuthSuccess {
  ok: true;
  source: "cookie" | "system-key" | "personal-token";
  role: ApiRole;
  /** 個人 token 認證時，帶入使用者資訊 */
  userId?: number;
  userName?: string;
  storeId?: number | null;
}

interface AuthFailure {
  ok: false;
  response: NextResponse;
}

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * 驗證 API 請求
 * 優先順序：Cookie → 系統 Key → 個人 Token（需查 DB）
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  // ── 方式一：Cookie session（Web 前端）──
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  if (sessionCookie?.value) {
    const session = verifySession<{ id: number; name: string; role: string; store_id: number | null }>(sessionCookie.value);
    if (session) {
      const role: ApiRole = session.role === "admin" || session.role === "owner" || session.role === "buyer" || session.role === "manager" ? "admin" : "user";
      return { ok: true, source: "cookie", role, userId: session.id, userName: session.name, storeId: session.store_id };
    }
    // 簽名無效 → 當作沒登入，繼續往下走
  }

  // ── 方式二/三：Bearer Token ──
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "未認證，請提供 Cookie session 或 API Token" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  // 方式二：系統 Key（全域）
  const adminKey = process.env.API_KEY_ADMIN;
  if (adminKey && token === adminKey) {
    return { ok: true, source: "system-key", role: "admin" };
  }

  const userKey = process.env.API_KEY_USER;
  if (userKey && token === userKey) {
    return { ok: true, source: "system-key", role: "user" };
  }

  // 向下相容舊 Key
  const legacyKey = process.env.API_KEY;
  if (legacyKey && token === legacyKey) {
    return { ok: true, source: "system-key", role: "admin" };
  }

  // ── 方式三：個人 API Token（查 DB）──
  try {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        storeId: users.storeId,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.apiToken, token))
      .limit(1);

    if (user && user.isActive) {
      const role: ApiRole = user.role === "admin" || user.role === "owner" || user.role === "buyer" || user.role === "manager" ? "admin" : "user";
      return {
        ok: true,
        source: "personal-token",
        role,
        userId: user.id,
        userName: user.name,
        storeId: user.storeId,
      };
    }
  } catch {
    // DB 查詢失敗，不影響其他認證方式
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "API Token 無效" }, { status: 401 }),
  };
}

/**
 * 取得使用者的門市過濾條件
 * admin/buyer → null（看全部）
 * manager/staff → 只看自己的 storeId
 */
export function getStoreFilter(auth: AuthSuccess): number | null {
  if (auth.source === "system-key") return null; // 系統 Key 看全部
  // 從 cookie 讀角色
  if (auth.source === "cookie") {
    const cookie = (auth as AuthSuccess & { _role?: string });
    // admin/buyer 看全部，manager/staff 只看自己店
    // 需要讀原始 role，不是 ApiRole
    return null; // 先回 null，在呼叫端再處理
  }
  return auth.storeId ?? null;
}

/**
 * 從 session cookie 讀取原始角色
 */
export function getSessionRole(request: NextRequest): string | null {
  const cookie = request.cookies.get(SESSION_COOKIE);
  if (!cookie?.value) return null;
  const session = verifySession<{ role: string }>(cookie.value);
  return session?.role ?? null;
}

/**
 * 取得門市過濾 ID — manager/staff 只能看自己門市
 * admin/buyer 回傳 null（看全部）
 */
export function getStoreScope(request: NextRequest, auth: AuthSuccess): number | null {
  if (auth.source === "system-key") return null;
  const role = getSessionRole(request);
  if (role === "admin" || role === "buyer") return null;
  return auth.storeId ?? null;
}

/**
 * 要求管理員權限
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth;

  if (auth.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "權限不足，需要管理員權限" },
        { status: 403 }
      ),
    };
  }

  return auth;
}
