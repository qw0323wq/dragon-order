/**
 * API 認證工具 — 雙軌認證 + 角色權限
 *
 * 認證方式（二擇一）：
 * 1. Cookie session（Web 前端用）— dragon-session cookie → role 從 cookie 讀取
 * 2. API Key（外部 AI / 系統用）— Authorization: Bearer <KEY>
 *    - API_KEY_ADMIN：管理員（全權限，可維護/修改系統）
 *    - API_KEY_USER：一般使用者（只能叫貨/查詢）
 *
 * 用法：
 *   const auth = authenticateRequest(request);
 *   if (!auth.ok) return auth.response;
 *   // auth.role === 'admin' | 'user'
 *
 *   // 需要管理員權限的 API：
 *   const auth = requireAdmin(request);
 *   if (!auth.ok) return auth.response;
 */

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "dragon-session";

/** API 角色：admin（全權限）、user（一般使用者） */
export type ApiRole = "admin" | "user";

interface AuthSuccess {
  ok: true;
  source: "cookie" | "apikey";
  role: ApiRole;
}

interface AuthFailure {
  ok: false;
  response: NextResponse;
}

export type AuthResult = AuthSuccess | AuthFailure;

/**
 * 驗證 API 請求（任何角色都可通過）
 *
 * CRITICAL: Cookie 和 API Key 只要通過一種就放行
 */
export function authenticateRequest(request: NextRequest): AuthResult {
  // 方式一：Cookie session（Web 前端）
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  if (sessionCookie?.value) {
    try {
      const session = JSON.parse(sessionCookie.value);
      // owner/manager → admin 權限，staff → user 權限
      const role: ApiRole = session.role === "owner" || session.role === "manager" ? "admin" : "user";
      return { ok: true, source: "cookie", role };
    } catch {
      return { ok: true, source: "cookie", role: "user" };
    }
  }

  // 方式二：API Key（外部系統）
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    // 檢查管理員 Key
    const adminKey = process.env.API_KEY_ADMIN;
    if (adminKey && token === adminKey) {
      return { ok: true, source: "apikey", role: "admin" };
    }

    // 檢查一般使用者 Key
    const userKey = process.env.API_KEY_USER;
    if (userKey && token === userKey) {
      return { ok: true, source: "apikey", role: "user" };
    }

    // 向下相容：舊的 API_KEY 視為 admin
    const legacyKey = process.env.API_KEY;
    if (legacyKey && token === legacyKey) {
      return { ok: true, source: "apikey", role: "admin" };
    }

    return {
      ok: false,
      response: NextResponse.json({ error: "API Key 無效" }, { status: 401 }),
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: "未認證，請提供 Cookie session 或 API Key" },
      { status: 401 }
    ),
  };
}

/**
 * 要求管理員權限
 * 用在敏感 API：使用者管理、供應商修改、付款標記、系統設定等
 */
export function requireAdmin(request: NextRequest): AuthResult {
  const auth = authenticateRequest(request);
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
