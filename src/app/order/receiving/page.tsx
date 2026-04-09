'use client'

/**
 * 員工驗收頁（手機優先設計）
 * 功能：
 *  1. 選擇日期，預設今天
 *  2. 按供應商分組顯示訂單品項
 *  3. 每項填入實收量、選擇狀態（正常/短缺/品質問題）
 *  4. 確認驗收，寫入 receiving 表
 *  5. 已驗收的品項顯示綠色勾勾
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ClipboardCheck,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── 型別 ────────────────────────────────────────────────────────────────────

interface OrderItem {
  orderItemId: number
  quantity: string
  unit: string
  unitPrice: number
  subtotal: number
  itemName: string
  itemCategory: string
  supplierName: string
  supplierId: number
  storeName: string
  storeId: number
}

interface ReceivingRecord {
  id: number
  orderItemId: number
  receivedQty: string
  result: string
  issue: string | null
  resolution: string | null
  receivedAt: string | null
}

/** 前端用驗收輸入狀態（每個 orderItem 一份） */
interface ReceivingInput {
  receivedQty: string
  result: string
  issue: string
}

interface Order {
  id: number
  orderDate: string
  status: string
  totalAmount: number
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

// ── 驗收狀態選項 ──────────────────────────────────────────────────────────────

const RESULT_OPTIONS = ['正常', '短缺', '品質問題', '未到貨']

const RESULT_COLORS: Record<string, string> = {
  正常: 'text-green-600',
  短缺: 'text-yellow-600',
  品質問題: 'text-red-600',
  未到貨: 'text-gray-500',
}

// ── 單一品項驗收列 ───────────────────────────────────────────────────────────

interface ItemRowProps {
  item: OrderItem
  input: ReceivingInput
  isReceived: boolean
  onChange: (field: keyof ReceivingInput, value: string) => void
}

function ItemRow({ item, input, isReceived, onChange }: ItemRowProps) {
  const orderedQty = parseFloat(item.quantity)
  const qtyStr = Number.isInteger(orderedQty) ? String(orderedQty) : orderedQty.toFixed(1)

  return (
    <div className={`py-3 px-1 border-b border-border last:border-0 ${isReceived ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-2">
        {/* 品項名稱 + 訂購量 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{item.itemName}</span>
            {isReceived && (
              <CheckCircle2 className="size-4 text-green-500 shrink-0" />
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {item.storeName} · 訂購 {qtyStr} {item.unit}
          </div>
        </div>
      </div>

      {/* 驗收輸入區 */}
      <div className="mt-2 flex items-center gap-2">
        {/* 實收量 */}
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step="0.5"
            min="0"
            className="w-20 h-10 text-center text-sm"
            placeholder={qtyStr}
            value={input.receivedQty}
            onChange={(e) => onChange('receivedQty', e.target.value)}
          />
          <span className="text-xs text-muted-foreground shrink-0">{item.unit}</span>
        </div>

        {/* 狀態選擇 */}
        <Select
          value={input.result}
          onValueChange={(v) => onChange('result', v ?? '正常')}
        >
          <SelectTrigger className="flex-1 h-10 text-sm">
            <SelectValue placeholder="狀態" />
          </SelectTrigger>
          <SelectContent>
            {RESULT_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                <span className={RESULT_COLORS[opt] ?? ''}>{opt}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 異常說明（非正常時才顯示） */}
      {input.result && input.result !== '正常' && (
        <div className="mt-2">
          <Input
            className="h-9 text-sm"
            placeholder="異常說明（選填）"
            value={input.issue}
            onChange={(e) => onChange('issue', e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

// ── 供應商驗收卡片 ────────────────────────────────────────────────────────────

interface SupplierReceivingCardProps {
  supplierName: string
  items: OrderItem[]
  inputs: Record<number, ReceivingInput>
  receivedIds: Set<number>
  onInputChange: (orderItemId: number, field: keyof ReceivingInput, value: string) => void
  onConfirm: (orderItemIds: number[]) => Promise<void>
  confirming: boolean
}

function SupplierReceivingCard({
  supplierName,
  items,
  inputs,
  receivedIds,
  onInputChange,
  onConfirm,
  confirming,
}: SupplierReceivingCardProps) {
  const allReceived = items.every((item) => receivedIds.has(item.orderItemId))
  const someReceived = items.some((item) => receivedIds.has(item.orderItemId))

  return (
    <Card className={allReceived ? 'border-green-200' : ''}>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{supplierName}</CardTitle>
            {allReceived && (
              <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                <CheckCircle2 className="size-3" />
                已驗收
              </Badge>
            )}
            {someReceived && !allReceived && (
              <Badge variant="secondary" className="text-xs">部分驗收</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{items.length} 項</span>
        </div>
      </CardHeader>
      <CardContent className="pt-1 pb-3">
        {items.map((item) => (
          <ItemRow
            key={item.orderItemId}
            item={item}
            input={inputs[item.orderItemId] ?? { receivedQty: '', result: '正常', issue: '' }}
            isReceived={receivedIds.has(item.orderItemId)}
            onChange={(field, value) => onInputChange(item.orderItemId, field, value)}
          />
        ))}

        {/* 確認驗收按鈕 */}
        {!allReceived && (
          <div className="mt-3">
            <Button
              className="w-full h-11 gap-2"
              onClick={() => onConfirm(items.map((i) => i.orderItemId))}
              disabled={confirming}
            >
              {confirming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ClipboardCheck className="size-4" />
              )}
              確認驗收（{supplierName}）
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

interface UserSession {
  id: number
  name: string
  role: string
  store_id: number | null
}

interface StoreOption { id: number; name: string }

export default function ReceivingPage() {
  const today = formatDate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [receivings, setReceivings] = useState<ReceivingRecord[]>([])
  const [inputs, setInputs] = useState<Record<number, ReceivingInput>>({})

  // 角色 + 門市篩選
  const [user, setUser] = useState<UserSession | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [storeFilter, setStoreFilter] = useState<string>('all')

  const isToday = selectedDate === today
  const isAdmin = user?.role === 'admin' || user?.role === 'buyer'

  // 載入使用者資訊 + 門市
  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        setUser(data)
        // manager/staff 預設只看自己門市
        if (data.role === 'manager' || data.role === 'staff') {
          setStoreFilter(data.store_id ? String(data.store_id) : 'all')
        }
      }
    }).catch(() => toast.error('載入資料失敗'))
    fetch('/api/stores').then(r => r.json()).then(setStores).catch(() => toast.error('載入門市失敗'))
  }, [])

  // 已驗收的 orderItemId 集合
  const receivedIds = new Set(receivings.map((r) => r.orderItemId))

  // 依角色過濾品項
  const filteredItems = items.filter(item => {
    if (storeFilter === 'all') return true
    return item.storeId === parseInt(storeFilter)
  })

  // 載入訂單與驗收資料
  const loadData = useCallback(async (date: string) => {
    setLoading(true)
    try {
      // 查詢該日期訂單
      const ordersRes = await fetch(`/api/orders?date=${date}&limit=1`)
      const orders: Order[] = await ordersRes.json()

      if (orders.length === 0) {
        setOrder(null)
        setItems([])
        setReceivings([])
        setInputs({})
        return
      }

      const ord = orders[0]
      setOrder(ord)

      // 查驗收資料（含訂單明細）
      const recRes = await fetch(`/api/receiving?orderId=${ord.id}`)
      const { details, receivings: recs } = await recRes.json()
      setItems(details)
      setReceivings(recs)

      // 初始化 inputs：已驗收的帶入已有資料，未驗收的預設正常
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
  }, [])

  useEffect(() => {
    loadData(selectedDate)
  }, [selectedDate, loadData])

  // 更新單一品項的輸入
  function handleInputChange(orderItemId: number, field: keyof ReceivingInput, value: string) {
    setInputs((prev) => ({
      ...prev,
      [orderItemId]: { ...prev[orderItemId], [field]: value },
    }))
  }

  // 確認驗收（按供應商批次送出）
  async function handleConfirm(orderItemIds: number[]) {
    setConfirming(true)
    try {
      const records = orderItemIds.map((id) => {
        const input = inputs[id] ?? { receivedQty: '', result: '正常', issue: '' }
        const item = items.find((i) => i.orderItemId === id)!
        return {
          orderItemId: id,
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
        toast.error('驗收送出失敗，請重試')
        return
      }

      toast.success('驗收完成！')
      // 重新載入驗收狀態
      if (order) {
        const recRes = await fetch(`/api/receiving?orderId=${order.id}`)
        const { receivings: recs } = await recRes.json()
        setReceivings(recs)
      }
    } catch {
      toast.error('發生錯誤，請重試')
    } finally {
      setConfirming(false)
    }
  }

  // 按供應商分組（用過濾後的品項）
  const supplierGroups = new Map<string, OrderItem[]>()
  for (const item of filteredItems) {
    if (!supplierGroups.has(item.supplierName)) supplierGroups.set(item.supplierName, [])
    supplierGroups.get(item.supplierName)!.push(item)
  }

  // 統計
  const totalItems = filteredItems.length
  const receivedCount = filteredItems.filter((i) => receivedIds.has(i.orderItemId)).length
  const allDone = totalItems > 0 && receivedCount === totalItems

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* 頂部：頁面標題 */}
      <div>
        <h2 className="font-heading text-xl font-semibold">驗收入庫</h2>
        <p className="text-sm text-muted-foreground mt-0.5">確認收到的貨品數量與品質</p>
      </div>

      {/* 日期選擇 */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="size-10" onClick={() => setSelectedDate((d) => addDays(d, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-1.5 text-sm font-medium flex-1 justify-center">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          {formatDisplay(selectedDate)}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-10"
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
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

      {/* 門市篩選（管理員/採購看全部，店長/員工只看自己店） */}
      {isAdmin && stores.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setStoreFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              storeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            全部門市
          </button>
          {stores.map(s => (
            <button
              key={s.id}
              onClick={() => setStoreFilter(String(s.id))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                storeFilter === String(s.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* 進度統計 */}
      {order && totalItems > 0 && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
          allDone ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'
        }`}>
          {allDone ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertTriangle className="size-4 shrink-0" />
          )}
          {allDone
            ? '全部驗收完成！'
            : `驗收進度：${receivedCount} / ${totalItems} 項`}
        </div>
      )}

      {/* 載入中 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 無訂單 */}
      {!loading && !order && (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">{formatDisplay(selectedDate)} 沒有訂單</p>
          </CardContent>
        </Card>
      )}

      {/* 供應商驗收卡片 */}
      {!loading && order && (
        <div className="space-y-4">
          {Array.from(supplierGroups.entries()).map(([supplierName, supplierItems]) => (
            <SupplierReceivingCard
              key={supplierName}
              supplierName={supplierName}
              items={supplierItems}
              inputs={inputs}
              receivedIds={receivedIds}
              onInputChange={handleInputChange}
              onConfirm={handleConfirm}
              confirming={confirming}
            />
          ))}
        </div>
      )}
    </div>
  )
}
