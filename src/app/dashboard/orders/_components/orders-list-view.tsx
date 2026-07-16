'use client'

/**
 * 訂單列表視圖（訂單頁預設模式）
 *
 * 參考 Costflows 的「列表優先 + 狀態 tab」資訊架構：
 *   日期範圍快選 → 狀態 pills（帶數字）→ 訂單列表 → 點一筆進單日視圖
 * 狀態 pills 用衍生工作流狀態（deriveWorkflowStatus），不用 DB status，
 * 因為 status 常停在 draft，驗收/付款進度才是實際的工作流位置。
 */

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Loader2, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/format'
import {
  formatDate, formatDisplay, addDays,
  deriveWorkflowStatus, WORKFLOW_LABELS, WORKFLOW_COLORS,
  STATUS_LABELS,
  type OrderOverviewRow, type WorkflowStatus,
} from './types'

export type ListFilter = 'all' | WorkflowStatus

type RangeKey = '7d' | '30d' | 'month'

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'month', label: '本月' },
]

function rangeToDates(range: RangeKey): { from: string; to: string } {
  const today = formatDate(new Date())
  if (range === '7d') return { from: addDays(today, -6), to: today }
  if (range === '30d') return { from: addDays(today, -29), to: today }
  return { from: today.slice(0, 8) + '01', to: today }
}

interface OrdersListViewProps {
  /** 初始 pill（首頁待辦卡帶 ?filter= 進來用） */
  initialFilter?: ListFilter
  /** 點一筆訂單 → 進該日期的單日視圖 */
  onSelectDate: (date: string) => void
}

export function OrdersListView({ initialFilter = 'all', onSelectDate }: OrdersListViewProps) {
  const [range, setRange] = useState<RangeKey>('30d')
  const [filter, setFilter] = useState<ListFilter>(initialFilter)
  const [rows, setRows] = useState<OrderOverviewRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { from, to } = rangeToDates(range)
        const res = await fetch(`/api/orders/overview?from=${from}&to=${to}`)
        if (!res.ok) { toast.error('載入訂單列表失敗'); return }
        const data = await res.json()
        if (!cancelled) setRows(data.orders || [])
      } catch {
        if (!cancelled) toast.error('載入訂單列表失敗')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [range])

  // 每列先算好衍生狀態，pills 計數與過濾共用
  const withStatus = useMemo(
    () => rows.map((r) => ({ ...r, workflow: deriveWorkflowStatus(r) })),
    [rows]
  )

  const counts = useMemo(() => {
    const c: Record<ListFilter, number> = {
      all: withStatus.length,
      'pending-receiving': 0, 'pending-payment': 0, done: 0, cancelled: 0, empty: 0,
    }
    for (const r of withStatus) c[r.workflow]++
    return c
  }, [withStatus])

  const filtered = useMemo(
    () => (filter === 'all' ? withStatus : withStatus.filter((r) => r.workflow === filter)),
    [withStatus, filter]
  )

  // 主要工作流 pills；已取消/空訂單只在有資料時出現
  const pills: { key: ListFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'pending-receiving', label: '待驗收' },
    { key: 'pending-payment', label: '待付款' },
    { key: 'done', label: '已完成' },
    ...(counts.cancelled > 0 ? [{ key: 'cancelled' as ListFilter, label: '已取消' }] : []),
    ...(counts.empty > 0 ? [{ key: 'empty' as ListFilter, label: '空訂單' }] : []),
  ]

  const pillClass = (active: boolean) =>
    `h-8 px-3 rounded-md text-xs font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="space-y-4">
      {/* 日期範圍快選 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {RANGE_OPTIONS.map((opt) => (
          <button key={opt.key} className={pillClass(range === opt.key)} onClick={() => setRange(opt.key)}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* 狀態 pills（帶數字） */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {pills.map((p) => (
          <button key={p.key} className={pillClass(filter === p.key)} onClick={() => setFilter(p.key)}>
            {p.label}
            <span className={`ml-1.5 tabular-nums ${filter === p.key ? 'opacity-80' : 'opacity-60'}`}>
              {counts[p.key]}
            </span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {filter === 'all' ? '這段期間沒有訂單' : `沒有「${WORKFLOW_LABELS[filter as WorkflowStatus]}」的訂單`}
          </CardContent>
        </Card>
      )}

      {/* 桌面：表格 */}
      {!loading && filtered.length > 0 && (
        <>
          <Card className="hidden md:block">
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead className="text-right">品項</TableHead>
                    <TableHead className="text-right">驗收進度</TableHead>
                    <TableHead className="text-right">付款進度</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => onSelectDate(r.orderDate)}
                    >
                      <TableCell className="font-medium">{formatDisplay(r.orderDate)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge className={WORKFLOW_COLORS[r.workflow]}>{WORKFLOW_LABELS[r.workflow]}</Badge>
                          {r.workflow !== 'cancelled' && r.status !== 'draft' && (
                            <span className="text-[10px] text-muted-foreground">{STATUS_LABELS[r.status] || r.status}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.itemCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <ProgressText done={r.receivedCount} total={r.itemCount} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <ProgressText done={r.paidSupplierCount} total={r.supplierCount} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(r.totalAmount)}</TableCell>
                      <TableCell><ChevronRight className="size-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 手機：卡片 */}
          <div className="md:hidden space-y-2.5">
            {filtered.map((r) => (
              <Card key={r.id} className="cursor-pointer active:bg-muted/50" onClick={() => onSelectDate(r.orderDate)}>
                <CardContent className="py-3.5 px-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{formatDisplay(r.orderDate)}</span>
                    <Badge className={WORKFLOW_COLORS[r.workflow]}>{WORKFLOW_LABELS[r.workflow]}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2 text-xs text-muted-foreground">
                    <span>
                      {r.itemCount} 品項 · 驗收 {r.receivedCount}/{r.itemCount} · 付款 {r.paidSupplierCount}/{r.supplierCount}
                    </span>
                    <span className="font-semibold text-foreground">{formatCurrency(r.totalAmount)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** 驗收/付款進度：完成綠色、未完成橘色、無資料灰色 */
function ProgressText({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-muted-foreground">—</span>
  const complete = done >= total
  return (
    <span className={complete ? 'text-green-600' : 'text-orange-600 font-medium'}>
      {done}/{total}
    </span>
  )
}
