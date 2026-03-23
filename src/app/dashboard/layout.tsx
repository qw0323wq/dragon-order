'use client'

/**
 * 後台主 Layout
 * 桌面：左側 sidebar 導航
 * 手機：底部固定 tab bar
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

/** 導航項目定義 */
const NAV_ITEMS = [
  { label: '儀表板', href: '/dashboard', icon: BarChart2 },
  { label: '訂單管理', href: '/dashboard/orders', icon: ClipboardList },
  { label: '供應商', href: '/dashboard/suppliers', icon: Store },
  { label: '品項管理', href: '/dashboard/menu', icon: Soup },
  { label: 'BOM 配方', href: '/dashboard/bom', icon: BookOpen },
  { label: '帳務', href: '/dashboard/payments', icon: Wallet },
  { label: 'POS 匯入', href: '/dashboard/import', icon: FileDown },
  { label: '設定', href: '/dashboard/settings', icon: Settings },
] as const

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  /**
   * 判斷當前路由是否命中該導航項
   * /dashboard 精確比對，子路由用 startsWith
   */
  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
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
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
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
            <p className="text-sm font-medium truncate">張銘瑋</p>
            <p className="text-xs text-muted-foreground truncate">老闆</p>
          </div>
          <Button variant="ghost" size="icon" title="登出">
            <LogOut className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </aside>

      {/* ===== 主內容區 ===== */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* 頂部 Header（桌面顯示，手機隱藏 —— 手機靠底部 tab 導覽） */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
          <h1 className="font-heading font-semibold text-base text-foreground">
            {NAV_ITEMS.find((n) => isActive(n.href))?.label ?? '後台管理'}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>張銘瑋</span>
            <Button variant="ghost" size="sm" className="gap-1.5">
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
            <span className="font-heading font-semibold text-sm">肥龍後台</span>
          </div>
          <span className="text-xs text-muted-foreground">張銘瑋</span>
        </header>

        {/* 頁面主體，保留底部 tab 的空間 */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>
      </div>

      {/* ===== 手機底部 Tab Bar ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-border bg-card">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} className="flex-1">
            <span
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                isActive(href)
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className="size-5" />
              {label}
            </span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
