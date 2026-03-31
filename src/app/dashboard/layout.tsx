'use client'

/**
 * 後台主 Layout
 * 桌面：左側 sidebar 導航（根據角色權限過濾）
 * 手機：底部固定 tab bar
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  BarChart2,
  ClipboardList,
  Store,
  Soup,
  Settings,
  LogOut,
  Flame,
  Wallet,
  FileDown,
  MoreHorizontal,
  BookOpen,
  TrendingUp,
  Package,
  ArrowRightLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ROLE_LABELS } from '@/lib/permissions'
import type { AppRole } from '@/lib/permissions'

/** 導航項目定義（含 pageKey 對應權限） */
const NAV_ITEMS = [
  { label: '儀表板', href: '/dashboard', icon: BarChart2, pageKey: 'dashboard' },
  { label: '訂單管理', href: '/dashboard/orders', icon: ClipboardList, pageKey: 'orders' },
  { label: '供應商', href: '/dashboard/suppliers', icon: Store, pageKey: 'suppliers' },
  { label: '品項管理', href: '/dashboard/menu', icon: Soup, pageKey: 'menu' },
  { label: 'BOM 配方', href: '/dashboard/bom', icon: BookOpen, pageKey: 'bom' },
  { label: '帳務', href: '/dashboard/payments', icon: Wallet, pageKey: 'payments' },
  // 叫貨單已合併到訂單管理頁
  { label: '庫存管理', href: '/dashboard/inventory', icon: Package, pageKey: 'inventory' },
  { label: '調撥/借料', href: '/dashboard/transfers', icon: ArrowRightLeft, pageKey: 'transfers' },
  { label: '營運報表', href: '/dashboard/reports', icon: BarChart2, pageKey: 'reports' },
  { label: '價格走勢', href: '/dashboard/price-trends', icon: TrendingUp, pageKey: 'price-trends' },
  { label: 'POS 匯入', href: '/dashboard/import', icon: FileDown, pageKey: 'import' },
  { label: '設定', href: '/dashboard/settings', icon: Settings, pageKey: 'settings' },
] as const

interface SessionInfo {
  name: string
  role: AppRole
  allowed_pages: string[]
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    // 從 cookie 讀取 session（client side 需要透過 API）
    fetch('/api/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) setSession(data)
      })
      .catch(() => {})
  }, [])

  const allowedPages = session?.allowed_pages ?? ['*']

  /** 根據權限過濾導航項目 */
  const visibleNav = NAV_ITEMS.filter((item) => {
    if (allowedPages.includes('*')) return true
    return allowedPages.includes(item.pageKey)
  })

  const userName = session?.name ?? '...'
  const roleLabel = session?.role ? ROLE_LABELS[session.role] : ''

  /**
   * 判斷當前路由是否命中該導航項
   * /dashboard 精確比對，子路由用 startsWith
   */
  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  async function handleLogout() {
    // 呼叫登出 API
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <div className="flex h-screen bg-background">
      {/* ===== 桌面左側 Sidebar ===== */}
      <aside className="hidden md:flex md:w-56 lg:w-60 flex-col border-r border-border bg-card shrink-0">
        {/* Logo 區 */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary">
            <Flame className="size-4 text-primary-foreground" />
          </div>
          <span className="font-heading font-semibold text-base text-foreground">
            肥龍後台
          </span>
        </div>

        {/* 導航列表 */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href}>
              <span
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive(href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </span>
            </Link>
          ))}
        </nav>

        <Separator />

        {/* 使用者資訊 + 登出 */}
        <div className="px-3 py-3 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{roleLabel}</p>
          </div>
          <Button variant="ghost" size="icon" title="登出" onClick={handleLogout}>
            <LogOut className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </aside>

      {/* ===== 主內容區 ===== */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* 頂部 Header（桌面顯示） */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
          <h1 className="font-heading font-semibold text-base text-foreground">
            {NAV_ITEMS.find((n) => isActive(n.href))?.label ?? '後台管理'}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{userName}</span>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={handleLogout}>
              <LogOut className="size-3.5" />
              登出
            </Button>
          </div>
        </header>

        {/* 手機頂部 mini header */}
        <header className="flex md:hidden items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary">
              <Flame className="size-3.5 text-primary-foreground" />
            </div>
            <span className="font-heading font-semibold text-sm">
              {visibleNav.find(n => isActive(n.href))?.label ?? '肥龍後台'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{userName}</span>
        </header>

        {/* 頁面主體 */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* ===== 手機底部 Tab Bar（最多 4 個 + 更多）===== */}
      {(() => {
        const MOBILE_MAX = 4
        const mobileMain = visibleNav.slice(0, MOBILE_MAX)
        const mobileMore = visibleNav.slice(MOBILE_MAX)
        const isMoreActive = mobileMore.some(n => isActive(n.href))

        return (
          <>
            <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-border bg-card" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              {mobileMain.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="flex-1">
                  <span className={cn(
                    'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                    isActive(href) ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    <Icon className="size-5" />
                    {label}
                  </span>
                </Link>
              ))}
              {mobileMore.length > 0 && (
                <button onClick={() => setMoreOpen(!moreOpen)} className="flex-1">
                  <span className={cn(
                    'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                    isMoreActive || moreOpen ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    <MoreHorizontal className="size-5" />
                    更多
                  </span>
                </button>
              )}
            </nav>

            {/* 更多選單 */}
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40 bg-black/20 md:hidden" onClick={() => setMoreOpen(false)} />
                <div className="fixed bottom-14 left-0 right-0 z-50 md:hidden bg-card border-t border-border rounded-t-2xl shadow-lg" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                  <div className="grid grid-cols-4 gap-1 p-3">
                    {mobileMore.map(({ label, href, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          'flex flex-col items-center gap-1 py-3 rounded-lg text-[11px] font-medium transition-colors',
                          isActive(href) ? 'text-primary bg-primary/5' : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <Icon className="size-5" />
                        {label}
                      </Link>
                    ))}
                    {/* 登出 */}
                    <button
                      onClick={async () => {
                        setMoreOpen(false)
                        await fetch('/api/logout', { method: 'POST' })
                        window.location.href = '/'
                      }}
                      className="flex flex-col items-center gap-1 py-3 rounded-lg text-[11px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      <LogOut className="size-5" />
                      登出
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )
      })()}
    </div>
  )
}
