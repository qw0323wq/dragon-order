'use client'

/**
 * 儀表板首頁
 * 從 /api/stats 與 /api/orders 取得真實資料
 * 包含：月份選擇器、統計卡片、品項排行、每日趨勢 BarChart、供應商圓餅圖、最近訂單
 */

import { useState, useEffect, useCallback } from 'react'
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
} from 'recharts'
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ShoppingCart,
  PackageSearch,
  Loader2,
  DollarSign,
  Store,
} from 'lucide-react'
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

// ── 火鍋暖色系調色盤 ──────────────────────────────────────────────────────────
const CHART_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
]

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

// ── 月份工具函式 ───────────────────────────────────────────────────────────────

/** 將 Date 格式化為 YYYY-MM */
function formatMonth(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** 格式化為顯示用：YYYY 年 MM 月 */
function formatMonthDisplay(month: string): string {
  const [y, m] = month.split('-')
  return `${y} 年 ${parseInt(m)} 月`
}

/** 月份加減，delta 為正負整數（月） */
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return formatMonth(d)
}

// ── 訂單狀態對照表 ────────────────────────────────────────────────────────────

const ORDER_STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: '草稿', variant: 'secondary' },
  confirmed: { label: '已確認', variant: 'default' },
  ordered: { label: '已叫貨', variant: 'default' },
  received: { label: '已驗收', variant: 'default' },
  closed: { label: '已結案', variant: 'outline' },
  pending: { label: '待叫貨', variant: 'destructive' },
}

// ── 品項排行名次 Badge ─────────────────────────────────────────────────────────

/** 前 3 名顯示金銀銅 badge，其餘顯示數字 */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400 text-white text-xs font-bold">
        1
      </span>
    )
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-400 text-white text-xs font-bold">
        2
      </span>
    )
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white text-xs font-bold">
        3
      </span>
    )
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 text-xs text-muted-foreground font-medium">
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
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg bg-popover px-3 py-2 text-sm shadow ring-1 ring-foreground/10">
      <p className="font-medium">{label}</p>
      <p className="text-primary">${payload[0].value.toLocaleString()}</p>
    </div>
  )
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const currentMonth = formatMonth(new Date())

  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
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
      toast.error('載入統計資料失敗，請重試')
    } finally {
      setStatsLoading(false)
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

  useEffect(() => {
    loadStats(selectedMonth)
  }, [selectedMonth, loadStats])

  useEffect(() => {
    loadRecentOrders()
  }, [loadRecentOrders])

  // ── 統計卡片資料（依 API 回傳動態計算） ───────────────────────────────────
  const summary = stats?.summary ?? { totalAmount: 0, itemCount: 0, orderCount: 0 }
  const supplierCount = stats?.topSuppliers.length ?? 0

  const statCards = [
    {
      title: '本月採購額',
      value: `$${summary.totalAmount.toLocaleString()}`,
      icon: DollarSign,
      desc: `${formatMonthDisplay(selectedMonth)}`,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600',
    },
    {
      title: '訂單數',
      value: String(summary.orderCount),
      icon: ShoppingCart,
      desc: '本月叫貨次數',
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600',
    },
    {
      title: '品項數',
      value: String(summary.itemCount),
      icon: PackageSearch,
      desc: '本月採購品項',
      iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
      iconColor: 'text-yellow-600',
    },
    {
      title: '供應商數',
      value: String(supplierCount),
      icon: Store,
      desc: '本月往來廠商',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600',
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
  const pieData = (stats?.topSuppliers ?? []).map((s, i) => ({
    name: s.supplierName,
    value: s.totalAmount,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  // ── TrendChart Y 軸格式化 ──────────────────────────────────────────────────
  const yTickFormatter = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`

  const isLoading = statsLoading

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ── 頂部：標題 + 月份選擇器 ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">儀表板</h2>
          <p className="text-sm text-muted-foreground mt-0.5">採購概況統計</p>
        </div>

        {/* 月份選擇器（與帳務頁樣式一致） */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => setSelectedMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-sm font-semibold min-w-[120px] text-center">
            {formatMonthDisplay(selectedMonth)}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            disabled={isCurrentMonth}
            onClick={() => setSelectedMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {!isCurrentMonth && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedMonth(currentMonth)}
            >
              回本月
            </Button>
          )}
        </div>
      </div>

      {/* ── 載入中遮罩 ───────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── 主要內容區（載入完成後顯示） ──────────────────────────────────── */}
      {!isLoading && (
        <>
          {/* ── 統計卡片 2x2（手機）/ 4 欄（桌面）────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {statCards.map((card) => {
              const Icon = card.icon
              return (
                <Card key={card.title}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{card.title}</p>
                        <p className="text-2xl font-bold font-heading mt-1 leading-none">
                          {card.value}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1.5 truncate">
                          {card.desc}
                        </p>
                      </div>
                      <div
                        className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${card.iconBg}`}
                      >
                        <Icon className={`size-4 ${card.iconColor}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* ── 品項排行（最重要區塊）──────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-orange-500" />
                  品項排行
                </CardTitle>
                {/* 排序切換按鈕 */}
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
                  <button
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      itemSortMode === 'qty'
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setItemSortMode('qty')}
                  >
                    依數量
                  </button>
                  <button
                    className={`px-3 py-1 text-xs rounded transition-colors ${
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
                <p className="text-center py-8 text-sm text-muted-foreground">
                  {formatMonthDisplay(selectedMonth)} 尚無採購紀錄
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                        <TableRow key={item.itemId}>
                          <TableCell className="text-center">
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
                          <TableCell className="text-right font-semibold">
                            {itemSortMode === 'qty'
                              ? `${item.totalQty.toLocaleString()} ${item.unit}`
                              : `$${item.totalAmount.toLocaleString()}`}
                          </TableCell>
                          {/* 次要欄位靠右灰色 */}
                          <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
                            {itemSortMode === 'qty'
                              ? `$${item.totalAmount.toLocaleString()}`
                              : `${item.totalQty.toLocaleString()} ${item.unit}`}
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
                <CardTitle>每日採購趨勢</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyChartData.length === 0 ? (
                  <p className="text-center py-12 text-sm text-muted-foreground">
                    本月尚無採購紀錄
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={dailyChartData}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={yTickFormatter}
                        width={44}
                      />
                      {/* CRITICAL: 使用自訂 Tooltip 以符合設計語言 */}
                      <Tooltip content={<BarTooltip />} />
                      <Bar
                        dataKey="totalAmount"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 供應商消費佔比 PieChart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>供應商消費佔比</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length === 0 ? (
                  <p className="text-center py-12 text-sm text-muted-foreground">
                    本月尚無採購紀錄
                  </p>
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
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value: string) => (
                          <span
                            style={{
                              fontSize: 11,
                              color: 'hsl(var(--muted-foreground))',
                            }}
                          >
                            {value}
                          </span>
                        )}
                      />
                      <Tooltip
                        formatter={(value) => [
                          `$${Number(value).toLocaleString()}`,
                          '',
                        ]}
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: '1px solid hsl(var(--border))',
                        }}
                      />
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
                <p className="text-center py-8 text-sm text-muted-foreground">
                  尚無訂單紀錄
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">
                              {order.orderDate}
                            </TableCell>
                            <TableCell className="text-right">
                              {order.totalAmount != null
                                ? `$${order.totalAmount.toLocaleString()}`
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
