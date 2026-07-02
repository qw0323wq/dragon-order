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
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/session";

/** Timing-safe string comparison to prevent timing attacks on API keys */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const SESSION_COOKIE = "dragon-session";

export type ApiRole = "admin" | "user";

interface AuthSuccess {
  ok: true;
  source: "cookie" | "system-key" | "personal-token";
  /**
   * 粗分二元角色（向下相容舊 code）。
   * CRITICAL: 不要拿這個當權限判斷依據 — buyer/manager 都會被歸成 "admin"。
   * 真正的權限判斷請用 userRole（真實 4 層角色）。
   */
  role: ApiRole;
  /**
   * 真實角色（admin/buyer/manager/staff）。requireAdmin/requireBuyerOrAbove/
   * requireManagerOrAbove 一律用這個判斷，避免 buyer/manager 被誤放成 admin。
   * system-key 全域 key → 'admin'；API_KEY_USER → 'staff'。
   */
  userRole: UserRole;
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
      return { ok: true, source: "cookie", role, userRole: normalizeRole(session.role), userId: session.id, userName: session.name, storeId: session.store_id };
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

  // 方式二：系統 Key（全域）— 使用 timing-safe 比對防止計時攻擊
  const adminKey = process.env.API_KEY_ADMIN;
  if (adminKey && safeCompare(token, adminKey)) {
    return { ok: true, source: "system-key", role: "admin", userRole: "admin" };
  }

  const userKey = process.env.API_KEY_USER;
  if (userKey && safeCompare(token, userKey)) {
    return { ok: true, source: "system-key", role: "user", userRole: "staff" };
  }

  // 向下相容舊 Key
  const legacyKey = process.env.API_KEY;
  if (legacyKey && safeCompare(token, legacyKey)) {
    return { ok: true, source: "system-key", role: "admin", userRole: "admin" };
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
        userRole: normalizeRole(user.role),
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

/** 合法角色白名單 */
export const VALID_ROLES = ["admin", "buyer", "manager", "staff"] as const;
export type UserRole = (typeof VALID_ROLES)[number];

/** 把 DB/session 的角色字串正規化成 UserRole（owner→admin，未知→staff 最保守） */
export function normalizeRole(raw: string | null | undefined): UserRole {
  if (raw === "owner") return "admin";
  if (raw === "admin" || raw === "buyer" || raw === "manager" || raw === "staff") return raw;
  return "staff";
}

function forbidden(msg: string): AuthFailure {
  return { ok: false, response: NextResponse.json({ error: msg }, { status: 403 }) };
}

/**
 * 要求「管理員」權限 — 只有 admin 通過。
 * 用於：使用者管理、權限設定、門市設定、刪除訂單等最高權限操作。
 * CRITICAL: 用 userRole（真實角色）判斷，不用 role（buyer/manager 會被誤放成 admin）。
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth;
  if (auth.userRole !== "admin") {
    return forbidden("權限不足，需要管理員權限");
  }
  return auth;
}

/**
 * 要求「採購以上」權限 — admin 或 buyer 通過，manager/staff 被拒。
 * 用於：品項/供應商/價格/帳務等採購管理操作（店長不該改進貨價、不該動這些）。
 */
export async function requireBuyerOrAbove(request: NextRequest): Promise<AuthResult> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth;
  if (auth.userRole !== "admin" && auth.userRole !== "buyer") {
    return forbidden("權限不足，此操作需要採購或管理員權限");
  }
  return auth;
}

/**
 * 要求「店長以上」權限 — admin/buyer/manager 通過，staff 被拒。
 * 用於：庫存異動、調撥、驗收、拆單等門市操作。
 * CRITICAL: 改用 auth.userRole，讓個人 token 路徑也正確擋 staff（舊版讀 cookie，token 會漏擋）。
 */
export async function requireManagerOrAbove(request: NextRequest): Promise<AuthResult> {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth;
  if (auth.userRole === "staff") {
    return forbidden("權限不足，此操作需要店長以上權限");
  }
  return auth;
}
