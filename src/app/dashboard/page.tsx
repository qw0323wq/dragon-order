'use client'

/**
 * 儀表板首頁
 * 顯示今日採購概況、近 7 天趨勢圖、供應商佔比圓餅圖、最近訂單
 */

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
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
  DollarSign,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Mock 資料 ─────────────────────────────────────────────────────────────────

/** 近 7 天採購金額趨勢 */
const MOCK_DAILY_STATS = [
  { date: '03/15', amount: 8500 },
  { date: '03/16', amount: 12300 },
  { date: '03/17', amount: 9800 },
  { date: '03/18', amount: 11200 },
  { date: '03/19', amount: 7600 },
  { date: '03/20', amount: 13500 },
  { date: '03/21', amount: 10200 },
]

/** 各供應商本月消費佔比 */
const MOCK_SUPPLIER_STATS = [
  { name: '以曜', value: 45000, color: '#ef4444' },
  { name: '瑞濱海鮮', value: 28000, color: '#f97316' },
  { name: '幕府', value: 15000, color: '#eab308' },
  { name: '韓流', value: 12000, color: '#22c55e' },
  { name: '鉊玖', value: 18000, color: '#3b82f6' },
  { name: '其他', value: 8000, color: '#8b5cf6' },
]

/** 訂單狀態對應中文 */
const ORDER_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  received: { label: '已驗收', variant: 'default' },
  closed: { label: '已結案', variant: 'outline' },
  pending: { label: '待叫貨', variant: 'destructive' },
}

/** 最近訂單列表 */
const MOCK_RECENT_ORDERS = [
  { id: 1, date: '2026/03/21', status: 'draft', items: 8, total: 10200, store: '全店' },
  { id: 2, date: '2026/03/20', status: 'received', items: 12, total: 13500, store: '全店' },
  { id: 3, date: '2026/03/19', status: 'closed', items: 6, total: 7600, store: '林森店' },
]

// ── 統計卡片資料 ──────────────────────────────────────────────────────────────

const STAT_CARDS = [
  {
    title: '今日採購額',
    value: '$10,200',
    icon: DollarSign,
    desc: '較昨日 -$3,300',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600',
  },
  {
    title: '本月累計',
    value: '$385,000',
    icon: TrendingUp,
    desc: '共 28 筆訂單',
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600',
  },
  {
    title: '待處理訂單',
    value: '3',
    icon: ShoppingCart,
    desc: '需今日完成叫貨',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600',
  },
  {
    title: '異常件數',
    value: '1',
    icon: AlertTriangle,
    desc: '瑞濱短缺 1 件',
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
    iconColor: 'text-rose-600',
  },
]

// ── 自訂 Tooltip ──────────────────────────────────────────────────────────────

/** BarChart 自訂 tooltip */
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

// ── 頁面元件 ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* 頁面標題 */}
      <div>
        <h2 className="font-heading text-xl font-semibold">儀表板</h2>
        <p className="text-sm text-muted-foreground mt-0.5">2026/03/21 今日採購概況</p>
      </div>

      {/* ── 統計卡片 2x2（手機） / 4 欄（桌面）── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {STAT_CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.title}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{card.title}</p>
                    <p className="text-2xl font-bold font-heading mt-1 leading-none">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1.5 truncate">{card.desc}</p>
                  </div>
                  <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${card.iconBg}`}>
                    <Icon className={`size-4 ${card.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ── 圖表區：趨勢 + 圓餅 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* 近 7 天採購趨勢 BarChart */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>近 7 天採購趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={MOCK_DAILY_STATS}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  width={40}
                />
                {/* CRITICAL: 使用自訂 Tooltip 以符合設計語言 */}
                <Tooltip content={<BarTooltip />} />
                <Bar
                  dataKey="amount"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 各供應商消費佔比 PieChart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>供應商消費佔比</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={MOCK_SUPPLIER_STATS}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {MOCK_SUPPLIER_STATS.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      {value}
                    </span>
                  )}
                />
                <Tooltip
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, '']}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── 最近訂單列表 ── */}
      <Card>
        <CardHeader>
          <CardTitle>最近訂單</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>門市</TableHead>
                <TableHead>品項數</TableHead>
                <TableHead>金額</TableHead>
                <TableHead>狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_RECENT_ORDERS.map((order) => {
                const status = ORDER_STATUS_MAP[order.status] ?? { label: order.status, variant: 'secondary' as const }
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.date}</TableCell>
                    <TableCell>{order.store}</TableCell>
                    <TableCell>{order.items} 項</TableCell>
                    <TableCell>${order.total.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
