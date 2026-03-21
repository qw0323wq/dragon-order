/**
 * API 認證工具 — 雙軌認證
 *
 * 支援兩種認證方式（二擇一）：
 * 1. Cookie session（Web 前端用）— dragon-session cookie
 * 2. API Key（外部系統用）— Authorization: Bearer <API_KEY>
 *
 * 用法：
 *   import { authenticateRequest } from "@/lib/api-auth";
 *
 *   export async function GET(request: NextRequest) {
 *     const auth = authenticateRequest(request);
 *     if (!auth.ok) return auth.response;
 *     // auth.source === 'cookie' | 'apikey'
 *   }
 */

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "dragon-session";

interface AuthSuccess {
  ok: true;
  source: "cookie" | "apikey";
}

interface AuthFailure {
  ok: false;
  response: NextResponse;
}

type AuthResult = AuthSuccess | AuthFailure;

/**
 * 驗證 API 請求
 *
 * CRITICAL: 兩種認證方式只要通過一種就放行
 * - Cookie: 檢查 dragon-session cookie 是否存在
 * - API Key: 檢查 Authorization header 的 Bearer token
 */
export function authenticateRequest(request: NextRequest): AuthResult {
  // 方式一：Cookie session（Web 前端）
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  if (sessionCookie?.value) {
    return { ok: true, source: "cookie" };
  }

  // 方式二：API Key（外部系統）
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const apiKey = process.env.API_KEY;

    if (apiKey && token === apiKey) {
      return { ok: true, source: "apikey" };
    }

    // 有帶 Authorization 但 key 不對
    return {
      ok: false,
      response: NextResponse.json(
        { error: "API Key 無效" },
        { status: 401 }
      ),
    };
  }

  // 都沒有 → 未認證
  return {
    ok: false,
    response: NextResponse.json(
      { error: "未認證，請提供 Cookie session 或 API Key" },
      { status: 401 }
    ),
  };
}
