'use client'

/**
 * 儀表板首頁 — 營運概覽
 * 從 /api/stats（當月 + 上月）與 /api/orders 取得真實資料
 * 包含：月份選擇器、待辦卡、統計卡（含月比）、衍生指標、品項排行、每日趨勢、供應商圓餅、最近訂單
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Label,
} from 'recharts'
import {
  TrendingUp,
  ShoppingCart,
  PackageSearch,
  Loader2,
  DollarSign,
  Store,
  ClipboardCheck,
  CreditCard,
  CalendarPlus,
  ChevronRight,
  BarChart3,
  PieChart as PieChartIcon,
  Inbox,
} from 'lucide-react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  deriveWorkflowStatus,
  type OrderOverviewRow,
} from './orders/_components/types'
import { MonthSelector } from '@/components/month-selector'
import { StatCard } from '@/components/ui/stat-card'
import { CountUp } from '@/components/ui/count-up'
import { DeltaBadge } from '@/components/ui/delta-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonStatCard, SkeletonTable } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── 火鍋暖色系色階（品牌紅 → 橘 → 琥珀，由深到淺）──────────────────────────
// 圓餅圖資料已依金額由大到小排序，深色自然落在佔比大的供應商上
const CHART_COLORS = [
  '#b91c1c',
  '#ef4444',
  '#f97316',
  '#fb923c',
  '#f59e0b',
  '#fbbf24',
  '#fcd34d',
  '#fde68a',
]

// 圖表統一字級 / 灰階
const CHART_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' }

// ── 型別定義 ──────────────────────────────────────────────────────────────────

interface TopItem {
  itemId: number
  itemName: string
  category: string
  supplierName: string
  unit: string
  totalQty: number
  totalAmount: number
  orderCount: number
}

interface TopSupplier {
  supplierId: number
  supplierName: string
  category: string
  totalAmount: number
  itemCount: number
}

interface DailyTrend {
  date: string
  totalAmount: number
  itemCount: number
}

interface StatsResponse {
  month: string
  topItems: TopItem[]
  topSuppliers: TopSupplier[]
  dailyTrend: DailyTrend[]
  summary: {
    totalAmount: number
    itemCount: number
    orderCount: number
  }
}

interface Order {
  id: number
  orderDate: string
  status: string
  totalAmount: number
  itemCount?: number
}

// ── 共用工具（從 lib/format 匯入）──
import {
  formatMonth,
  formatMonthDisplay,
  formatDateLocal,
  formatCurrency,
  formatAmount,
  addMonths,
} from '@/lib/format'

/**
 * 月比變化百分比（純顯示用）。
 * 上月無資料或為 0 時回 null → 不顯示徽章（避免除以 0 產生 Infinity）
 */
function deltaPercent(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null
  return ((Number(current) - Number(previous)) / Number(previous)) * 100
}

/** 該月份的總天數（用於標示「本月尚未結束」） */
function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// ── 待辦摘要（參考 Costflows 概覽的待辦導向卡片）──────────────────────────────

interface Todos {
  todayOrder: OrderOverviewRow | null
  pendingReceiving: number
  pendingPayment: number
}

/** 可點擊的待辦卡：urgent 時橘色強調，點了直達對應頁籤 */
function TodoCard({
  href, icon: Icon, label, value, urgent,
}: {
  href: string
  icon: LucideIcon
  label: string
  value: string
  urgent: boolean
}) {
  return (
    <Link href={href} className="block">
      <Card className={`transition-colors hover:bg-muted/50 ${urgent ? 'border-orange-300 dark:border-orange-700' : ''}`}>
        <CardContent className="py-3 px-3 sm:px-4 flex items-center gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${
            urgent
              ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
              : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
          }`}>
            <Icon className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold truncate">{value}</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  )
}

// ── 衍生指標列（細分隔線網格：gap-px + 底色 = 髮絲線）───────────────────────

interface DerivedMetric {
  label: string
  value: string
  hint?: string
}

function MetricStrip({ metrics }: { metrics: DerivedMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-foreground/10 ring-1 ring-foreground/10 lg:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} className="bg-card px-3 py-3 sm:px-4">
          <p className="truncate text-xs text-muted-foreground">{m.label}</p>
          <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums text-foreground">
            {m.value}
          </p>
          {m.hint && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.hint}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── 訂單狀態對照表 ────────────────────────────────────────────────────────────

const ORDER_STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  // 狀態機：draft → submitted → ordered → receiving → received → closed（另有 cancelled）
  draft: { label: '編輯中', variant: 'secondary' },
  submitted: { label: '已送出', variant: 'default' },
  ordered: { label: '已叫貨', variant: 'default' },
  receiving: { label: '待驗收', variant: 'destructive' },
  received: { label: '已驗收', variant: 'default' },
  closed: { label: '已結案', variant: 'outline' },
  cancelled: { label: '已取消', variant: 'outline' },
  pending: { label: '待叫貨', variant: 'destructive' },
  confirmed: { label: '已確認', variant: 'default' }, // 已棄用的舊值，保留向下相容
}

// ── 品項排行名次 Badge ─────────────────────────────────────────────────────────

/** 前 3 名顯示金銀銅 badge，其餘顯示數字 */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400 text-white text-xs font-bold tabular-nums">
        1
      </span>
    )
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-400 text-white text-xs font-bold tabular-nums">
        2
      </span>
    )
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs font-bold tabular-nums">
        3
      </span>
    )
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 text-xs text-muted-foreground font-medium tabular-nums">
      {rank}
    </span>
  )
}

// ── 自訂 BarChart Tooltip ─────────────────────────────────────────────────────

function BarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload: { itemCount: number } }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const { itemCount } = payload[0].payload
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
      <p className="font-medium text-foreground tabular-nums">{label}</p>
      <p className="mt-0.5 font-semibold text-primary tabular-nums">
        {formatCurrency(payload[0].value)}
      </p>
      <p className="text-muted-foreground tabular-nums">{itemCount} 項</p>
    </div>
  )
}

// ── 自訂 PieChart Tooltip ─────────────────────────────────────────────────────

function PieTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number }>
  total: number
}) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  const share = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
      <p className="font-medium text-foreground">{name}</p>
      <p className="mt-0.5 font-semibold text-primary tabular-nums">
        {formatCurrency(value)}
      </p>
      <p className="text-muted-foreground tabular-nums">佔 {share.toFixed(1)}%</p>
    </div>
  )
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const currentMonth = formatMonth(new Date())

  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  // 上月統計：只用來算月比徽章，載入失敗不影響主畫面
  const [prevStats, setPrevStats] = useState<StatsResponse | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [todos, setTodos] = useState<Todos | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  // 品項排行排序方式：'qty' 依數量 | 'amount' 依金額
  const [itemSortMode, setItemSortMode] = useState<'qty' | 'amount'>('qty')

  const isCurrentMonth = selectedMonth === currentMonth

  // ── 載入月份統計 ───────────────────────────────────────────────────────────
  const loadStats = useCallback(async (month: string) => {
    setStatsLoading(true)
    try {
      const res = await fetch(`/api/stats?month=${month}`)
      if (!res.ok) {
        toast.error('載入統計資料失敗')
        return
      }
      const data: StatsResponse = await res.json()
      setStats(data)
    } catch {
      toast.error('載入統計資料失敗')
    } finally {
      setStatsLoading(false)
    }
  }, [])

  // ── 載入上月統計（僅供月比徽章；失敗就靜默不顯示徽章）─────────────────────
  const loadPrevStats = useCallback(async (month: string) => {
    setPrevStats(null) // 先清空，避免新月份短暫配到舊的比較基準
    try {
      const res = await fetch(`/api/stats?month=${addMonths(month, -1)}`)
      if (!res.ok) return
      const data: StatsResponse = await res.json()
      setPrevStats(data)
    } catch {
      // 靜默：月比徽章是輔助資訊
    }
  }, [])

  // ── 載入最近 5 筆訂單（只在初次掛載時載入，不跟月份連動）
  const loadRecentOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const res = await fetch('/api/orders?limit=5')
      if (!res.ok) {
        toast.error('載入訂單列表失敗')
        return
      }
      const data: Order[] = await res.json()
      setRecentOrders(data)
    } catch {
      toast.error('載入訂單列表失敗')
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  // ── 載入待辦摘要（近 30 天，/api/orders/overview 預設範圍）──────────────
  const loadTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/orders/overview')
      if (!res.ok) return // 待辦卡載入失敗不擋首頁其他區塊
      const data = await res.json()
      const rows: OrderOverviewRow[] = data.orders || []
      const today = formatDateLocal()
      let pendingReceiving = 0
      let pendingPayment = 0
      for (const r of rows) {
        const w = deriveWorkflowStatus(r)
        if (w === 'pending-receiving') pendingReceiving++
        else if (w === 'pending-payment') pendingPayment++
      }
      setTodos({
        todayOrder: rows.find((r) => r.orderDate === today) ?? null,
        pendingReceiving,
        pendingPayment,
      })
    } catch {
      // 靜默：待辦卡是輔助資訊
    }
  }, [])

  useEffect(() => {
    loadStats(selectedMonth)
    loadPrevStats(selectedMonth)
  }, [selectedMonth, loadStats, loadPrevStats])

  useEffect(() => {
    loadRecentOrders()
    loadTodos()
  }, [loadRecentOrders, loadTodos])

  // ── 統計卡片資料（依 API 回傳動態計算） ───────────────────────────────────
  const summary = stats?.summary ?? { totalAmount: 0, itemCount: 0, orderCount: 0 }
  const supplierCount = stats?.topSuppliers.length ?? 0

  // 月比：上月完全沒抓到 → delta 為 null → StatCard 不顯示 trend
  const statCards = [
    {
      title: '採購額',
      raw: summary.totalAmount,
      format: formatCurrency,
      icon: DollarSign,
      desc: formatMonthDisplay(selectedMonth),
      accent: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
      delta: deltaPercent(summary.totalAmount, prevStats?.summary.totalAmount),
    },
    {
      title: '訂單數',
      raw: summary.orderCount,
      format: formatAmount,
      icon: ShoppingCart,
      desc: '叫貨次數',
      accent: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
      delta: deltaPercent(summary.orderCount, prevStats?.summary.orderCount),
    },
    {
      title: '品項數',
      raw: summary.itemCount,
      format: formatAmount,
      icon: PackageSearch,
      desc: '採購品項',
      accent: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
      delta: deltaPercent(summary.itemCount, prevStats?.summary.itemCount),
    },
    {
      title: '供應商數',
      raw: supplierCount,
      format: formatAmount,
      icon: Store,
      desc: '往來廠商',
      accent: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      delta: deltaPercent(supplierCount, prevStats?.topSuppliers.length),
    },
  ]

  // ── 品項排行：依選擇的排序模式排序 ────────────────────────────────────────
  const sortedItems = [...(stats?.topItems ?? [])].sort((a, b) =>
    itemSortMode === 'qty' ? b.totalQty - a.totalQty : b.totalAmount - a.totalAmount
  )

  // ── 每日趨勢：X 軸只顯示日（MM/DD）────────────────────────────────────────
  const dailyChartData = (stats?.dailyTrend ?? []).map((d) => ({
    date: d.date.slice(5).replace('-', '/'), // YYYY-MM-DD → MM/DD
    totalAmount: d.totalAmount,
    itemCount: d.itemCount,
  }))

  // ── 供應商圓餅圖資料 ───────────────────────────────────────────────────────
  // CRITICAL: 供應商一多（實測 3 月有 18 家）圖例會撐滿整張卡、把圓餅壓到看不見
  //           → 只畫前 6 大，其餘合併成一塊「其他 N 家」（灰色）
  const PIE_MAX = 6
  const pieData = (() => {
    const all = stats?.topSuppliers ?? []
    const top = all.slice(0, PIE_MAX).map((s, i) => ({
      name: s.supplierName,
      value: s.totalAmount,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))
    const rest = all.slice(PIE_MAX)
    const restTotal = rest.reduce((sum, s) => sum + s.totalAmount, 0)
    if (restTotal > 0) {
      top.push({ name: `其他 ${rest.length} 家`, value: restTotal, color: '#d4d4d8' })
    }
    return top
  })()

  // ── 衍生指標（全部由既有 API 資料推導，不另外打 API）──────────────────────
  const purchaseDays = stats?.dailyTrend.length ?? 0
  const avgPerPurchaseDay = purchaseDays > 0 ? summary.totalAmount / purchaseDays : 0
  const avgPerOrder =
    summary.orderCount > 0 ? summary.totalAmount / summary.orderCount : 0
  const peakDay = (stats?.dailyTrend ?? []).reduce<DailyTrend | null>(
    (max, d) => (max === null || d.totalAmount > max.totalAmount ? d : max),
    null
  )
  const topSupplier = stats?.topSuppliers[0] ?? null
  const topSupplierShare =
    topSupplier && summary.totalAmount > 0
      ? (topSupplier.totalAmount / summary.totalAmount) * 100
      : 0

  const derivedMetrics: DerivedMetric[] = [
    {
      label: '採購日均',
      value: formatCurrency(Math.round(avgPerPurchaseDay)),
      hint: `${purchaseDays} 天有進貨`,
    },
    {
      label: '單筆均額',
      value: formatCurrency(Math.round(avgPerOrder)),
      hint: `${formatAmount(summary.orderCount)} 張訂單`,
    },
    {
      label: '最高單日',
      value: peakDay ? formatCurrency(peakDay.totalAmount) : '—',
      hint: peakDay ? peakDay.date.slice(5).replace('-', '/') : undefined,
    },
    {
      label: '最大供應商',
      value: `${topSupplierShare.toFixed(0)}%`,
      hint: topSupplier?.supplierName,
    },
  ]

  // ── TrendChart Y 軸格式化（軸標籤需要縮寫，故不用 formatCurrency）─────────
  const yTickFormatter = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`

  // 只在「首次載入、還沒有任何資料」時顯示整頁骨架屏；
  // 切月份時 stats 已有舊資料 → 保留畫面、無縫換成新月份，不再整頁閃爍
  const showSkeleton = statsLoading && !stats
  const hasData = summary.totalAmount > 0

  return (
    <div className="p-4 md:p-6 space-y-5 md:space-y-6">

      {/* ── 頂部：標題 + 月份選擇器 ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">營運概覽</h2>
          <p className="text-sm text-muted-foreground mt-0.5">採購概況統計</p>
        </div>

        {/* 月份選擇器（統一用 MonthSelector 元件） */}
        <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* ── 待辦摘要卡（獨立載入，不受月份與骨架屏影響）───────────────────── */}
      {todos && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {todos.todayOrder ? (
            <TodoCard
              href={`/dashboard/orders?date=${formatDateLocal()}`}
              icon={CalendarPlus}
              label="今日叫貨"
              value={`已建單 · ${formatCurrency(todos.todayOrder.totalAmount)}`}
              urgent={false}
            />
          ) : (
            <TodoCard
              href="/order"
              icon={CalendarPlus}
              label="今日叫貨"
              value="尚未建單，去叫貨 →"
              urgent
            />
          )}
          <TodoCard
            href="/dashboard/orders?filter=pending-receiving"
            icon={ClipboardCheck}
            label="待驗收（近 30 天）"
            value={todos.pendingReceiving > 0 ? `${todos.pendingReceiving} 張訂單` : '全部驗收完成'}
            urgent={todos.pendingReceiving > 0}
          />
          <TodoCard
            href="/dashboard/orders?filter=pending-payment"
            icon={CreditCard}
            label="待付款（近 30 天）"
            value={todos.pendingPayment > 0 ? `${todos.pendingPayment} 張訂單` : '全部付款完成'}
            urgent={todos.pendingPayment > 0}
          />
        </div>
      )}

      {/* ── 載入中骨架屏（僅首次載入；切月保留舊資料） ──────────────────────── */}
      {showSkeleton && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonStatCard key={i} />
            ))}
          </div>
          <SkeletonTable rows={6} cols={4} />
        </div>
      )}

      {/* ── 主要內容區（載入完成後顯示；切月時仍顯示舊資料直到新資料到位） ── */}
      {!showSkeleton && (
        <>
          {/* ── 統計卡片 2x2（手機）/ 4 欄（桌面）────────────────────────── */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {statCards.map((card) => (
                <StatCard
                  key={card.title}
                  label={card.title}
                  // 切月份時數字滾動過去，不硬跳
                  value={<CountUp value={card.raw} format={card.format} />}
                  icon={card.icon}
                  accent={card.accent}
                  // 上月有資料才顯示徽章；採購成本上升 = 壞事 → 沿用預設漲紅跌綠
                  trend={
                    card.delta !== null ? (
                      <DeltaBadge percent={Number(card.delta)} />
                    ) : undefined
                  }
                  hint={card.delta !== null ? '較上月' : card.desc}
                />
              ))}
            </div>

            {/* 本月尚未結束 → 與上月「全月」相比會偏低，明講避免誤讀 */}
            {isCurrentMonth && prevStats && (
              <p className="text-xs text-muted-foreground tabular-nums">
                本月進行中（第 {new Date().getDate()} / {daysInMonth(selectedMonth)} 天），
                月比是與上月<span className="font-medium">全月</span>相比，僅供參考
              </p>
            )}
          </div>

          {/* ── 衍生指標列（有資料才顯示，否則整排 $0 是雜訊）─────────────── */}
          {hasData && <MetricStrip metrics={derivedMetrics} />}

          {/* ── 品項排行（最重要區塊）──────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-orange-500 dark:text-orange-400" />
                  品項排行
                </CardTitle>
                {/* 排序切換按鈕 */}
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  <button
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      itemSortMode === 'qty'
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setItemSortMode('qty')}
                  >
                    依數量
                  </button>
                  <button
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      itemSortMode === 'amount'
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setItemSortMode('amount')}
                  >
                    依金額
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sortedItems.length === 0 ? (
                <EmptyState
                  icon={PackageSearch}
                  title={`${formatMonthDisplay(selectedMonth)} 尚無採購紀錄`}
                  description={
                    isCurrentMonth
                      ? '這個月還沒有任何叫貨單。建立第一張叫貨單後，這裡會列出叫最多的品項排行。'
                      : '這個月份沒有叫貨紀錄。可用上方月份選擇器切換到其他月份查看。'
                  }
                  action={
                    isCurrentMonth ? (
                      <Button size="sm" onClick={() => router.push('/order')}>
                        去叫貨
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-10 text-center">排名</TableHead>
                        <TableHead>品項</TableHead>
                        <TableHead className="hidden sm:table-cell">分類</TableHead>
                        <TableHead className="hidden md:table-cell">供應商</TableHead>
                        <TableHead className="text-right">
                          {itemSortMode === 'qty' ? '總數量' : '總金額'}
                        </TableHead>
                        <TableHead className="text-right hidden sm:table-cell">
                          {itemSortMode === 'qty' ? '總金額' : '總數量'}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedItems.map((item, idx) => (
                        <TableRow key={item.itemId} className="hover:bg-muted/30">
                          <TableCell className="text-center px-1 sm:px-2">
                            <RankBadge rank={idx + 1} />
                          </TableCell>
                          <TableCell className="font-medium">{item.itemName}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline" className="text-xs">
                              {item.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {item.supplierName}
                          </TableCell>
                          {/* 主要排序欄位靠右粗體 */}
                          <TableCell className="text-right font-semibold tabular-nums">
                            {itemSortMode === 'qty'
                              ? `${formatAmount(item.totalQty)} ${item.unit}`
                              : formatCurrency(item.totalAmount)}
                          </TableCell>
                          {/* 次要欄位靠右灰色 */}
                          <TableCell className="text-right text-sm text-muted-foreground tabular-nums hidden sm:table-cell">
                            {itemSortMode === 'qty'
                              ? formatCurrency(item.totalAmount)
                              : `${formatAmount(item.totalQty)} ${item.unit}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 圖表區：趨勢 + 圓餅 ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* 每日採購趨勢 BarChart */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-primary" />
                  每日採購趨勢
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyChartData.length === 0 ? (
                  <EmptyState
                    icon={BarChart3}
                    title="這個月還沒有採購資料"
                    description="有叫貨單之後，這裡會顯示每天的採購金額分布。"
                    className="py-10"
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={dailyChartData}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        strokeOpacity={0.5}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={CHART_TICK}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={CHART_TICK}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={yTickFormatter}
                        width={44}
                      />
                      {/* CRITICAL: 使用自訂 Tooltip 以符合設計語言 */}
                      <Tooltip
                        content={<BarTooltip />}
                        cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
                      />
                      <Bar
                        dataKey="totalAmount"
                        fill="var(--primary)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 供應商消費佔比 PieChart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="size-4 text-primary" />
                  供應商消費佔比
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <EmptyState
                    icon={PieChartIcon}
                    title="這個月還沒有供應商往來"
                    description="有叫貨單之後，這裡會顯示各供應商的消費佔比。"
                    className="py-10"
                  />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="42%"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                        {/* 甜甜圈中心補上總額，省一次視線來回 */}
                        <Label
                          content={({ viewBox }) => {
                            if (!viewBox || !('cx' in viewBox)) return null
                            const { cx, cy } = viewBox as { cx: number; cy: number }
                            return (
                              <g>
                                <text
                                  x={cx}
                                  y={cy - 7}
                                  textAnchor="middle"
                                  fill="var(--muted-foreground)"
                                  style={{ fontSize: 10 }}
                                >
                                  總額
                                </text>
                                <text
                                  x={cx}
                                  y={cy + 9}
                                  textAnchor="middle"
                                  fill="var(--foreground)"
                                  style={{ fontSize: 13, fontWeight: 600 }}
                                >
                                  {formatCurrency(summary.totalAmount)}
                                </text>
                              </g>
                            )
                          }}
                        />
                      </Pie>
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value: string) => (
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--muted-foreground)',
                            }}
                          >
                            {value}
                          </span>
                        )}
                      />
                      <Tooltip content={<PieTooltip total={summary.totalAmount} />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── 最近訂單（固定 5 筆，不跟月份連動） ─────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>最近訂單</CardTitle>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : recentOrders.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="尚無訂單紀錄"
                  description="系統還沒有任何叫貨單。建立第一張之後，最近 5 筆會顯示在這裡。"
                  action={
                    <Button size="sm" onClick={() => router.push('/order')}>
                      去叫貨
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>日期</TableHead>
                        <TableHead className="text-right">金額</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentOrders.map((order) => {
                        const status =
                          ORDER_STATUS_MAP[order.status] ?? {
                            label: order.status,
                            variant: 'secondary' as const,
                          }
                        return (
                          <TableRow
                            key={order.id}
                            className="cursor-pointer hover:bg-muted/30"
                            onClick={() => router.push(`/dashboard/orders?date=${order.orderDate}`)}
                          >
                            <TableCell className="font-medium tabular-nums">
                              {order.orderDate}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {order.totalAmount != null
                                ? formatCurrency(order.totalAmount)
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={status.variant}>{status.label}</Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
