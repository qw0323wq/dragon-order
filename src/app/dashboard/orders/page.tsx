'use client'

/**
 * 訂單管理頁面
 * 功能：
 *  1. 日期切換（查看過去訂單）
 *  2. 明細表格 / 按供應商彙總
 *  3. 複製訂單文字（按門市分開，簡潔格式）
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  ClipboardCopy,
  CheckCircle,
  LayoutList,
  LayoutGrid,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── 型別 ───────────────────────────────────────────────────────────────────────

interface OrderDetail {
  id: number
  quantity: string
  unit: string
  unitPrice: number
  subtotal: number
  notes: string | null
  itemName: string
  itemCategory: string
  supplierName: string
  supplierId: number
  storeName: string
  storeId: number
}

interface Order {
  id: number
  orderDate: string
  status: string
  totalAmount: number
  notes: string | null
}

// ── 日期工具 ─────────────────────────────────────────────────────────────────

/** 格式化日期為 YYYY-MM-DD */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** 格式化日期為顯示用 YYYY/MM/DD（週X） */
function formatDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}（週${weekdays[d.getDay()]}）`
}

/** 日期加減 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

// ── 狀態中文對照 ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  confirmed: '已確認',
  ordered: '已叫貨',
  received: '已驗收',
  closed: '已結案',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  ordered: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
}

// ── 輔助函式 ─────────────────────────────────────────────────────────────────

/** 按供應商分組 */
function groupBySupplier(details: OrderDetail[]): Map<string, OrderDetail[]> {
  const map = new Map<string, OrderDetail[]>()
  for (const d of details) {
    if (!map.has(d.supplierName)) map.set(d.supplierName, [])
    map.get(d.supplierName)!.push(d)
  }
  return map
}

/**
 * 產生供應商叫貨文字（按門市分開，簡潔格式）
 *
 * 格式範例：
 * 叫貨店家：信義安和
 * 台灣豬五花8斤
 * CH霜降牛3斤
 *
 * 叫貨店家：林森店
 * 台灣豬五花10斤
 * CH霜降牛5斤
 */
function buildOrderText(items: OrderDetail[]): string {
  // 按門市分組
  const byStore = new Map<string, OrderDetail[]>()
  for (const item of items) {
    if (!byStore.has(item.storeName)) byStore.set(item.storeName, [])
    byStore.get(item.storeName)!.push(item)
  }

  const sections: string[] = []
  for (const [storeName, storeItems] of byStore) {
    const lines = [`叫貨店家：${storeName}`]
    for (const item of storeItems) {
      const qty = parseFloat(item.quantity)
      // 整數不顯示小數點
      const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
      lines.push(`${item.itemName}${qtyStr}${item.unit}`)
    }
    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

// ── 供應商卡片 ───────────────────────────────────────────────────────────────

interface SupplierCardProps {
  supplier: string
  items: OrderDetail[]
  ordered: boolean
  onMarkOrdered: (supplier: string) => void
}

function SupplierOrderCard({ supplier, items, ordered, onMarkOrdered }: SupplierCardProps) {
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0)

  async function handleCopy() {
    const text = buildOrderText(items)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已複製 ${supplier} 的叫貨文字`)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      toast.success(`已複製 ${supplier} 的叫貨文字`)
    }
  }

  // 按門市分組顯示
  const byStore = new Map<string, OrderDetail[]>()
  for (const item of items) {
    if (!byStore.has(item.storeName)) byStore.set(item.storeName, [])
    byStore.get(item.storeName)!.push(item)
  }

  return (
    <Card className={ordered ? 'opacity-70' : ''}>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{supplier}</CardTitle>
            {ordered && (
              <Badge variant="default" className="gap-1">
                <CheckCircle className="size-3" />
                已叫貨
              </Badge>
            )}
          </div>
          <span className="text-sm font-semibold text-primary">
            小計 ${subtotal.toLocaleString()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {/* 按門市顯示品項 */}
        {Array.from(byStore.entries()).map(([storeName, storeItems], idx) => (
          <div key={storeName}>
            {idx > 0 && <Separator className="my-3" />}
            <p className="text-sm font-medium text-muted-foreground mb-2">{storeName}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品項</TableHead>
                  <TableHead className="text-right">數量</TableHead>
                  <TableHead className="text-right">小計</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storeItems.map((item) => {
                  const qty = parseFloat(item.quantity)
                  const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.itemName}</TableCell>
                      <TableCell className="text-right">
                        {qtyStr} {item.unit}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${item.subtotal.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ))}

        <Separator className="my-3" />

        {/* 操作按鈕 */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleCopy}
          >
            <ClipboardCopy className="size-3.5" />
            複製叫貨文字
          </Button>
          <Button
            variant={ordered ? 'secondary' : 'default'}
            size="sm"
            className="gap-1.5"
            onClick={() => onMarkOrdered(supplier)}
          >
            <CheckCircle className="size-3.5" />
            {ordered ? '取消標記' : '標記已叫貨'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── 頁面主元件 ───────────────────────────────────────────────────────────────

type ViewMode = 'detail' | 'summary'

export default function OrdersPage() {
  const today = formatDate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMode, setViewMode] = useState<ViewMode>('summary')
  const [orderedSuppliers, setOrderedSuppliers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<Order | null>(null)
  const [details, setDetails] = useState<OrderDetail[]>([])

  const isToday = selectedDate === today

  // 從 API 讀取訂單
  const fetchOrder = useCallback(async (date: string) => {
    setLoading(true)
    setOrderedSuppliers(new Set())
    try {
      // 先查該日期有沒有訂單
      const ordersRes = await fetch(`/api/orders?date=${date}&limit=1`)
      const orders: Order[] = await ordersRes.json()

      if (orders.length === 0) {
        setOrder(null)
        setDetails([])
        setLoading(false)
        return
      }

      const ord = orders[0]
      setOrder(ord)

      // 查訂單明細
      const detailRes = await fetch(`/api/orders/${ord.id}`)
      const data = await detailRes.json()
      setDetails(data.details || [])
    } catch {
      toast.error('載入訂單失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrder(selectedDate)
  }, [selectedDate, fetchOrder])

  // 按供應商分組
  const supplierGroups = useMemo(() => groupBySupplier(details), [details])

  // 訂單總額
  const grandTotal = useMemo(
    () => details.reduce((sum, d) => sum + d.subtotal, 0),
    [details]
  )

  // 切換供應商叫貨標記
  function toggleOrdered(supplier: string) {
    setOrderedSuppliers((prev) => {
      const next = new Set(prev)
      if (next.has(supplier)) next.delete(supplier)
      else next.add(supplier)
      return next
    })
  }

  // 日期導航
  function goDay(offset: number) {
    setSelectedDate((prev) => addDays(prev, offset))
  }

  // 狀態
  const orderedCount = orderedSuppliers.size
  const allOrdered = orderedCount === supplierGroups.size && supplierGroups.size > 0
  const orderStatus = order
    ? STATUS_LABELS[order.status] || order.status
    : '無訂單'

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── 頂部：日期導航 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="font-heading text-xl font-semibold">訂單管理</h2>

          {/* 日期切換 */}
          <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="icon" className="size-8" onClick={() => goDay(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex items-center gap-1.5 text-sm font-medium min-w-[180px] justify-center">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              {formatDisplay(selectedDate)}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => goDay(1)}
              disabled={isToday}
            >
              <ChevronRight className="size-4" />
            </Button>
            {!isToday && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(today)}>
                回今天
              </Button>
            )}
          </div>

          {/* 狀態 */}
          {order && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className={STATUS_COLORS[order.status] || ''}>{orderStatus}</Badge>
              {supplierGroups.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  {orderedCount}/{supplierGroups.size} 供應商已叫貨
                </span>
              )}
            </div>
          )}
        </div>

        {/* 合計金額 */}
        {order && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">採購總計</p>
            <p className="text-xl font-bold font-heading text-primary">
              ${grandTotal.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* ── 載入中 ── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── 無訂單 ── */}
      {!loading && !order && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">
              {formatDisplay(selectedDate)} 沒有訂單
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── 有訂單 ── */}
      {!loading && order && details.length > 0 && (
        <>
          {/* 視圖切換 */}
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'detail' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setViewMode('detail')}
            >
              <LayoutList className="size-3.5" />
              明細
            </Button>
            <Button
              variant={viewMode === 'summary' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setViewMode('summary')}
            >
              <LayoutGrid className="size-3.5" />
              彙總（按供應商）
            </Button>
          </div>

          {/* 明細表格 */}
          {viewMode === 'detail' && (
            <Card>
              <CardHeader>
                <CardTitle>訂單明細</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>品項</TableHead>
                      <TableHead>供應商</TableHead>
                      <TableHead>門市</TableHead>
                      <TableHead className="text-right">數量</TableHead>
                      <TableHead>單位</TableHead>
                      <TableHead className="text-right">單價</TableHead>
                      <TableHead className="text-right">小計</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.map((d) => {
                      const qty = parseFloat(d.quantity)
                      const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{d.itemName}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{d.supplierName}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{d.storeName}</TableCell>
                          <TableCell className="text-right">{qtyStr}</TableCell>
                          <TableCell className="text-muted-foreground">{d.unit}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            ${d.unitPrice}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            ${d.subtotal.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={6} className="font-semibold text-right">
                        總計
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary text-base">
                        ${grandTotal.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* 彙總視圖 */}
          {viewMode === 'summary' && (
            <div className="space-y-4">
              {Array.from(supplierGroups.entries()).map(([supplier, items]) => (
                <SupplierOrderCard
                  key={supplier}
                  supplier={supplier}
                  items={items}
                  ordered={orderedSuppliers.has(supplier)}
                  onMarkOrdered={toggleOrdered}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
