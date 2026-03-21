/**
 * Next.js Middleware — 路由保護
 *
 * 設計決策（Edge Runtime 限制）：
 * - Edge Runtime 不支援 Node.js 的 jsonwebtoken
 * - 此 middleware 只做「cookie 是否存在」的輕量檢查
 * - 完整 JWT 驗證在各 Server Component / Route Handler 中用 getSession() 執行
 * - 這樣可避免 Edge Runtime 相容性問題，且安全性不受影響
 *   （即使有 cookie 但 token 無效，Server Component 會驗失敗並 redirect）
 *
 * 保護路由：
 * - /order          → 需要登入（任何角色）
 * - /dashboard/**   → 需要登入（完整驗證在 Server Component 做）
 *
 * CRITICAL: 若新增需要保護的路由，必須同步更新下方的 matcher 設定
 */

import { type NextRequest, NextResponse } from 'next/server';

// CRITICAL: cookie 名稱必須與 src/lib/auth.ts 的 SESSION_COOKIE 一致
const SESSION_COOKIE = 'dragon-session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 檢查 session cookie 是否存在（輕量檢查）
  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  const hasSession = !!sessionCookie?.value;

  // 需要登入的路徑：/order 和 /dashboard 下所有路由
  const isProtectedRoute =
    pathname.startsWith('/order') || pathname.startsWith('/dashboard');

  if (isProtectedRoute && !hasSession) {
    // 未登入，重導到首頁（登入頁）
    // 附上 from 參數讓登入後可以跳回原頁
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

/**
 * Middleware 套用範圍
 * 排除靜態資源和 Next.js 內部路徑，避免不必要的執行
 */
export const config = {
  matcher: [
    /*
     * 套用於所有路徑，但排除：
     * - _next/static（靜態資源）
     * - _next/image（圖片最佳化）
     * - favicon.ico
     * - public 資料夾下的靜態檔案
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
