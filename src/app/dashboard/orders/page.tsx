'use client'

/**
 * 訂單管理頁面
 * 功能：
 *  1. 日期切換（查看過去訂單）
 *  2. 明細表格 / 按供應商彙總
 *  3. 複製訂單文字（按門市分開，簡潔格式）
 *  4. 驗收 Tab（桌面版驗收操作）
 *  5. 付款 Tab（按供應商列出應付金額，可標記付款）
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
  ClipboardCheck,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

interface ReceivingRecord {
  id: number
  orderItemId: number
  receivedQty: string
  result: string
  issue: string | null
  receivedAt: string | null
}

interface ReceivingInput {
  receivedQty: string
  result: string
  issue: string
}

/** 供應商付款資訊（從 API 或 detail 計算） */
interface SupplierPaymentInfo {
  supplierId: number
  supplierName: string
  paymentType: string
  totalAmount: number
  isPaid: boolean
}

// ── 日期工具 ─────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}（週${weekdays[d.getDay()]}）`
}

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

const RESULT_OPTIONS = ['正常', '短缺', '品質問題', '未到貨']

// ── 輔助函式 ─────────────────────────────────────────────────────────────────

function groupBySupplier(details: OrderDetail[]): Map<string, OrderDetail[]> {
  const map = new Map<string, OrderDetail[]>()
  for (const d of details) {
    if (!map.has(d.supplierName)) map.set(d.supplierName, [])
    map.get(d.supplierName)!.push(d)
  }
  return map
}

function buildOrderText(items: OrderDetail[]): string {
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
      const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
      lines.push(`${item.itemName}${qtyStr}${item.unit}`)
    }
    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

// ── 供應商訂單彙總卡片 ────────────────────────────────────────────────────────

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
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      toast.success(`已複製 ${supplier} 的叫貨文字`)
    }
  }

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

// ── 驗收 Tab 內容 ─────────────────────────────────────────────────────────────

interface ReceivingTabProps {
  orderId: number
}

function ReceivingTab({ orderId }: ReceivingTabProps) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [items, setItems] = useState<Array<{
    orderItemId: number
    quantity: string
    unit: string
    itemName: string
    supplierName: string
    storeName: string
  }>>([])
  const [receivings, setReceivings] = useState<ReceivingRecord[]>([])
  const [inputs, setInputs] = useState<Record<number, ReceivingInput>>({})

  const loadReceiving = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/receiving?orderId=${orderId}`)
      const { details, receivings: recs } = await res.json()
      setItems(details)
      setReceivings(recs)

      const newInputs: Record<number, ReceivingInput> = {}
      for (const item of details) {
        const existing = recs.find((r: ReceivingRecord) => r.orderItemId === item.orderItemId)
        newInputs[item.orderItemId] = {
          receivedQty: existing ? existing.receivedQty : '',
          result: existing ? existing.result : '正常',
          issue: existing?.issue ?? '',
        }
      }
      setInputs(newInputs)
    } catch {
      toast.error('載入驗收資料失敗')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadReceiving()
  }, [loadReceiving])

  const receivedIds = new Set(receivings.map((r) => r.orderItemId))

  function handleInputChange(orderItemId: number, field: keyof ReceivingInput, value: string) {
    setInputs((prev) => ({
      ...prev,
      [orderItemId]: { ...prev[orderItemId], [field]: value },
    }))
  }

  async function handleSubmitAll() {
    setSubmitting(true)
    try {
      const records = items.map((item) => {
        const input = inputs[item.orderItemId] ?? { receivedQty: '', result: '正常', issue: '' }
        return {
          orderItemId: item.orderItemId,
          receivedQty: input.receivedQty || item.quantity,
          result: input.result || '正常',
          issue: input.issue || null,
        }
      })

      const res = await fetch('/api/receiving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })

      if (!res.ok) {
        toast.error('驗收送出失敗')
        return
      }

      toast.success('全部驗收完成！')
      await loadReceiving()
    } catch {
      toast.error('發生錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const receivedCount = items.filter((i) => receivedIds.has(i.orderItemId)).length
  const allDone = items.length > 0 && receivedCount === items.length

  // 按供應商分組
  const supplierGroups = new Map<string, typeof items>()
  for (const item of items) {
    if (!supplierGroups.has(item.supplierName)) supplierGroups.set(item.supplierName, [])
    supplierGroups.get(item.supplierName)!.push(item)
  }

  return (
    <div className="space-y-4">
      {/* 進度統計 */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
        allDone ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'
      }`}>
        {allDone ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        {allDone ? '全部驗收完成！' : `驗收進度：${receivedCount} / ${items.length} 項`}
      </div>

      {/* 按供應商分組的驗收表格 */}
      {Array.from(supplierGroups.entries()).map(([supplierName, supplierItems]) => {
        const allSupplierReceived = supplierItems.every((i) => receivedIds.has(i.orderItemId))

        return (
          <Card key={supplierName} className={allSupplierReceived ? 'border-green-200' : ''}>
            <CardHeader className="border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{supplierName}</CardTitle>
                {allSupplierReceived && (
                  <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                    <CheckCircle2 className="size-3" />
                    已驗收
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>品項</TableHead>
                    <TableHead>門市</TableHead>
                    <TableHead className="text-right">訂購量</TableHead>
                    <TableHead>實收量</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>異常說明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierItems.map((item) => {
                    const input = inputs[item.orderItemId] ?? { receivedQty: '', result: '正常', issue: '' }
                    const isReceived = receivedIds.has(item.orderItemId)
                    const qty = parseFloat(item.quantity)
                    const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)

                    return (
                      <TableRow key={item.orderItemId} className={isReceived ? 'bg-green-50/50' : ''}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {isReceived && <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />}
                            {item.itemName}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.storeName}</TableCell>
                        <TableCell className="text-right text-sm">
                          {qtyStr} {item.unit}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              className="w-20 h-8 text-sm text-center"
                              placeholder={qtyStr}
                              value={input.receivedQty}
                              onChange={(e) => handleInputChange(item.orderItemId, 'receivedQty', e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">{item.unit}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={input.result}
                            onValueChange={(v) => handleInputChange(item.orderItemId, 'result', v ?? '正常')}
                          >
                            <SelectTrigger className="w-28 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RESULT_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {input.result !== '正常' && (
                            <Input
                              className="w-32 h-8 text-xs"
                              placeholder="說明"
                              value={input.issue}
                              onChange={(e) => handleInputChange(item.orderItemId, 'issue', e.target.value)}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}

      {/* 全部送出按鈕 */}
      {!allDone && (
        <Button
          className="w-full h-11 gap-2"
          onClick={handleSubmitAll}
          disabled={submitting}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ClipboardCheck className="size-4" />
          )}
          送出全部驗收
        </Button>
      )}
    </div>
  )
}

// ── 付款 Tab 內容 ─────────────────────────────────────────────────────────────

interface PaymentTabProps {
  details: OrderDetail[]
  orderId: number
}

function PaymentTab({ details, orderId }: PaymentTabProps) {
  const [paidSuppliers, setPaidSuppliers] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState<number | null>(null)

  // 按供應商整理應付金額
  const supplierPayments = useMemo<SupplierPaymentInfo[]>(() => {
    const map = new Map<number, SupplierPaymentInfo>()
    for (const d of details) {
      if (!map.has(d.supplierId)) {
        map.set(d.supplierId, {
          supplierId: d.supplierId,
          supplierName: d.supplierName,
          // 付款方式暫時未知，預設月結（後續可從 API 取得）
          paymentType: '月結',
          totalAmount: 0,
          isPaid: false,
        })
      }
      map.get(d.supplierId)!.totalAmount += d.subtotal
    }
    return Array.from(map.values())
  }, [details])

  // 更新付款狀態（這裡僅做前端標記，實際需呼叫 API）
  async function handleMarkPaid(supplierId: number, supplierName: string, amount: number) {
    setSubmitting(supplierId)
    try {
      // 建立付款紀錄
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          supplierId,
          amount,
          paymentType: '現結',
          status: 'paid',
        }),
      })

      if (res.ok || res.status === 409) {
        // 409 = 已有紀錄，也算成功
        if (res.status === 409) {
          // 更新現有紀錄
          const existing = await res.json()
          if (existing?.id) {
            await fetch('/api/payments', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId: existing.id, status: 'paid' }),
            })
          }
        }
        setPaidSuppliers((prev) => new Set([...prev, supplierId]))
        toast.success(`已標記 ${supplierName} 付款完成`)
      } else {
        toast.error('標記付款失敗')
      }
    } catch {
      toast.error('發生錯誤')
    } finally {
      setSubmitting(null)
    }
  }

  const grandTotal = supplierPayments.reduce((sum, s) => sum + s.totalAmount, 0)
  const paidTotal = supplierPayments
    .filter((s) => paidSuppliers.has(s.supplierId))
    .reduce((sum, s) => sum + s.totalAmount, 0)

  return (
    <div className="space-y-4">
      {/* 合計金額 */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">採購總計</p>
            <p className="text-xl font-bold text-primary font-heading">${grandTotal.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">已付金額</p>
            <p className="text-xl font-bold text-green-600 font-heading">${paidTotal.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* 供應商付款列表 */}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>供應商</TableHead>
                <TableHead>結帳方式</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierPayments.map((s) => {
                const isPaid = paidSuppliers.has(s.supplierId)
                return (
                  <TableRow key={s.supplierId} className={isPaid ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{s.supplierName}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={s.paymentType === '現結'
                          ? 'border-red-200 text-red-700 bg-red-50'
                          : 'border-blue-200 text-blue-700 bg-blue-50'}
                      >
                        {s.paymentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${s.totalAmount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {isPaid ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 className="size-3.5" />
                          已付款
                        </span>
                      ) : s.paymentType === '月結' ? (
                        <span className="text-xs text-blue-600 font-medium">月結</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={submitting === s.supplierId}
                          onClick={() => handleMarkPaid(s.supplierId, s.supplierName, s.totalAmount)}
                        >
                          {submitting === s.supplierId ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <CreditCard className="size-3" />
                          )}
                          標記已付款
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {/* 合計列 */}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={2}>合計</TableCell>
                <TableCell className="text-right text-primary">
                  ${grandTotal.toLocaleString()}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── 頁面主元件 ───────────────────────────────────────────────────────────────

type ViewMode = 'detail' | 'summary' | 'receiving' | 'payment'

export default function OrdersPage() {
  const today = formatDate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMode, setViewMode] = useState<ViewMode>('summary')
  const [orderedSuppliers, setOrderedSuppliers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<Order | null>(null)
  const [details, setDetails] = useState<OrderDetail[]>([])

  const isToday = selectedDate === today

  const fetchOrder = useCallback(async (date: string) => {
    setLoading(true)
    setOrderedSuppliers(new Set())
    try {
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

  const supplierGroups = useMemo(() => groupBySupplier(details), [details])
  const grandTotal = useMemo(
    () => details.reduce((sum, d) => sum + d.subtotal, 0),
    [details]
  )

  function toggleOrdered(supplier: string) {
    setOrderedSuppliers((prev) => {
      const next = new Set(prev)
      if (next.has(supplier)) next.delete(supplier)
      else next.add(supplier)
      return next
    })
  }

  function goDay(offset: number) {
    setSelectedDate((prev) => addDays(prev, offset))
  }

  const orderedCount = orderedSuppliers.size
  const allOrdered = orderedCount === supplierGroups.size && supplierGroups.size > 0
  const orderStatus = order
    ? STATUS_LABELS[order.status] || order.status
    : '無訂單'

  // Tab 按鈕樣式
  const tabClass = (mode: ViewMode) =>
    `h-8 text-xs px-3 rounded-md font-medium transition-colors ${
      viewMode === mode
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'bg-muted text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── 頂部：日期導航 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-semibold">訂單管理</h2>
            <Link href="/order">
              <Button size="sm" className="gap-1.5">
                <PlusCircle className="size-3.5" />
                新增訂單
              </Button>
            </Link>
          </div>

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
              {supplierGroups.size > 0 && viewMode === 'summary' && (
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
          {/* Tab 切換 */}
          <div className="flex gap-1.5 flex-wrap">
            <button className={tabClass('summary')} onClick={() => setViewMode('summary')}>
              <span className="flex items-center gap-1">
                <LayoutGrid className="size-3" />
                彙總
              </span>
            </button>
            <button className={tabClass('detail')} onClick={() => setViewMode('detail')}>
              <span className="flex items-center gap-1">
                <LayoutList className="size-3" />
                明細
              </span>
            </button>
            <button className={tabClass('receiving')} onClick={() => setViewMode('receiving')}>
              <span className="flex items-center gap-1">
                <ClipboardCheck className="size-3" />
                驗收
              </span>
            </button>
            <button className={tabClass('payment')} onClick={() => setViewMode('payment')}>
              <span className="flex items-center gap-1">
                <CreditCard className="size-3" />
                付款
              </span>
            </button>
          </div>

          {/* ── 彙總視圖 ── */}
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

          {/* ── 明細表格 ── */}
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

          {/* ── 驗收 Tab ── */}
          {viewMode === 'receiving' && (
            <ReceivingTab orderId={order.id} />
          )}

          {/* ── 付款 Tab ── */}
          {viewMode === 'payment' && (
            <PaymentTab details={details} orderId={order.id} />
          )}
        </>
      )}
    </div>
  )
}
