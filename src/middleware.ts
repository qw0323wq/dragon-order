/**
 * Next.js Middleware — 路由保護（Edge Runtime）
 *
 * 設計決策：
 * - Middleware 只做「cookie 是否存在」+ 「基本格式檢查」
 * - 完整 HMAC 簽名驗證在 Server Component / API Route 做
 *   （Edge Runtime 的 crypto API 有限制，避免相容性問題）
 * - 即使偽造 cookie 繞過 middleware，API/Server Component 會驗證簽名失敗
 */

import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'dragon-session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  if (!sessionCookie?.value) {
    if (pathname.startsWith('/api/')) return NextResponse.next();
    const isProtected = pathname.startsWith('/order') || pathname.startsWith('/dashboard');
    if (isProtected) {
      const loginUrl = new URL('/', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 基本格式檢查：signed session 格式為 base64url.base64url
  const value = sessionCookie.value;
  if (!value.includes('.')) {
    // 舊的明文 JSON 格式或無效格式 → 清除 cookie，重新登入
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  // 嘗試解析 payload（不驗簽名，只做頁面權限路由）
  try {
    const payload = value.split('.')[0];
    const json = JSON.parse(
      typeof atob === 'function'
        ? atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        : Buffer.from(payload, 'base64url').toString('utf8')
    );
    const allowedPages: string[] = json.allowed_pages ?? ['*'];

    if (allowedPages.includes('*') || json.role === 'admin') {
      return NextResponse.next();
    }

    let pageKey: string | null = null;
    if (pathname === '/dashboard') pageKey = 'dashboard';
    else if (pathname.startsWith('/order')) pageKey = 'order';
    else if (pathname.startsWith('/dashboard/')) {
      const match = pathname.match(/^\/dashboard\/([^/]+)/);
      if (match) pageKey = match[1];
    }

    if (pageKey && !allowedPages.includes(pageKey)) {
      const firstAllowed = allowedPages[0];
      if (firstAllowed === 'order') {
        return NextResponse.redirect(new URL('/order', request.url));
      }
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  } catch {
    // 解析失敗，放行讓 server component 處理
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
