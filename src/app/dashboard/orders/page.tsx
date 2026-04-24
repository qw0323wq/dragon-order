'use client'

/**
 * 訂單管理頁面（含叫貨單）
 * Tab: 彙總 | 明細 | 叫貨單 | 驗收 | 付款
 *
 * 拆分（P2-C9，2026-04-24）：
 *   _components/types.ts                    — 共用型別（含 PO 型別）
 *   _components/supplier-order-card.tsx     — 彙總 Tab 的供應商卡片（行內編輯）
 *   _components/detail-tab-with-filter.tsx  — 明細 Tab（唯讀+門市篩選）
 *   _components/purchase-orders-tab.tsx     — 叫貨單 Tab（產生/複製/下載/列印）
 *   _components/receiving-tab.tsx           — 驗收 Tab
 *   _components/payment-tab.tsx             — 付款 Tab
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  LayoutList, LayoutGrid, CalendarDays, ChevronLeft, ChevronRight,
  Loader2, ClipboardCheck, CreditCard, PlusCircle, FileText, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { sumBy, formatCurrency } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import {
  formatDate, formatDisplay, addDays, groupBySupplier,
  STATUS_LABELS, STATUS_COLORS,
  type Order, type OrderDetail,
} from './_components/types'
import { SupplierOrderCard } from './_components/supplier-order-card'
import { ReceivingTab } from './_components/receiving-tab'
import { PaymentTab } from './_components/payment-tab'
import { DetailTabWithFilter } from './_components/detail-tab-with-filter'
import { PurchaseOrdersTab } from './_components/purchase-orders-tab'

type ViewMode = 'summary' | 'detail' | 'purchase-orders' | 'receiving' | 'payment'
const VALID_VIEW_MODES: ViewMode[] = ['summary', 'detail', 'purchase-orders', 'receiving', 'payment']

export default function OrdersPage() {
  const today = formatDate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMode, setViewMode] = useState<ViewMode>('summary')

  // P2-C8: /purchase-orders 導過來會帶 ?tab=purchase-orders，進頁後切到對應 tab
  // 用 useEffect 避免 useSearchParams 的 Suspense 要求（wrap 整頁太繁瑣）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const urlTab = params.get('tab') as ViewMode | null
    if (urlTab && VALID_VIEW_MODES.includes(urlTab)) {
      setViewMode(urlTab)
    }
  }, [])

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
        setOrder(null); setDetails([]); setLoading(false); return
      }
      const ord = orders[0]
      setOrder(ord)
      const detailRes = await fetch(`/api/orders/${ord.id}`)
      const data = await detailRes.json()
      setDetails(data.details || [])
      if (data.order) setOrder(data.order)
    } catch {
      toast.error('載入訂單失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOrder(selectedDate) }, [selectedDate, fetchOrder])

  const supplierGroups = useMemo(() => groupBySupplier(details), [details])
  const grandTotal = useMemo(() => sumBy(details, d => d.subtotal), [details])

  function toggleOrdered(supplier: string) {
    setOrderedSuppliers(prev => {
      const next = new Set(prev)
      if (next.has(supplier)) next.delete(supplier); else next.add(supplier)
      return next
    })
  }

  function goDay(offset: number) { setSelectedDate(prev => addDays(prev, offset)) }

  async function handleDeleteOrder() {
    if (!order || !confirm('確定要刪除這整張訂單？所有品項都會被刪除。')) return
    const res = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('訂單已刪除')
      setOrder(null); setDetails([])
    } else {
      toast.error('刪除失敗')
    }
  }

  const orderedCount = orderedSuppliers.size
  const orderStatus = order ? STATUS_LABELS[order.status] || order.status : '無訂單'

  const tabClass = (mode: ViewMode) =>
    `h-8 text-xs px-3 rounded-md font-medium transition-colors ${
      viewMode === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 頂部 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-xl font-semibold">訂單管理</h2>
            <Link href="/order">
              <Button size="sm" className="gap-1.5"><PlusCircle className="size-3.5" /> 新增訂單</Button>
            </Link>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="icon" className="size-8" onClick={() => goDay(-1)}><ChevronLeft className="size-4" /></Button>
            <div className="flex items-center gap-1.5 text-sm font-medium min-w-[180px] justify-center">
              <CalendarDays className="size-3.5 text-muted-foreground" />{formatDisplay(selectedDate)}
            </div>
            <Button variant="outline" size="icon" className="size-8" onClick={() => goDay(1)} disabled={isToday}><ChevronRight className="size-4" /></Button>
            {!isToday && <Button variant="ghost" size="sm" onClick={() => setSelectedDate(today)}>回今天</Button>}
          </div>
          {order && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className={STATUS_COLORS[order.status] || ''}>{orderStatus}</Badge>
              {order.createdByName && <span className="text-xs text-muted-foreground">建單人：{order.createdByName}</span>}
              <Button variant="ghost" size="sm" className="text-xs text-destructive h-6 px-2" onClick={handleDeleteOrder}>
                <Trash2 className="size-3 mr-1" /> 刪除訂單
              </Button>
            </div>
          )}
        </div>
        {order && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">採購總計</p>
            <p className="text-xl font-bold font-heading text-primary">{formatCurrency(grandTotal)}</p>
          </div>
        )}
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}

      {!loading && !order && (
        <Card><CardContent className="py-16 text-center"><p className="text-muted-foreground">{formatDisplay(selectedDate)} 沒有訂單</p></CardContent></Card>
      )}

      {!loading && order && details.length > 0 && (
        <>
          {/* Tab 切換 */}
          <div className="flex gap-1.5 flex-wrap">
            <button className={tabClass('summary')} onClick={() => setViewMode('summary')}>
              <span className="flex items-center gap-1"><LayoutGrid className="size-3" /> 彙總</span>
            </button>
            <button className={tabClass('detail')} onClick={() => setViewMode('detail')}>
              <span className="flex items-center gap-1"><LayoutList className="size-3" /> 明細</span>
            </button>
            <button className={tabClass('purchase-orders')} onClick={() => setViewMode('purchase-orders')}>
              <span className="flex items-center gap-1"><FileText className="size-3" /> 叫貨單</span>
            </button>
            <button className={tabClass('receiving')} onClick={() => setViewMode('receiving')}>
              <span className="flex items-center gap-1"><ClipboardCheck className="size-3" /> 驗收</span>
            </button>
            <button className={tabClass('payment')} onClick={() => setViewMode('payment')}>
              <span className="flex items-center gap-1"><CreditCard className="size-3" /> 付款</span>
            </button>
          </div>

          {viewMode === 'summary' && (
            <div className="space-y-4">
              {Array.from(supplierGroups.entries()).map(([supplier, items]) => (
                <SupplierOrderCard
                  key={supplier}
                  supplier={supplier}
                  items={items}
                  ordered={orderedSuppliers.has(supplier)}
                  onMarkOrdered={toggleOrdered}
                  orderId={order?.id}
                  onRefresh={() => fetchOrder(selectedDate)}
                />
              ))}
            </div>
          )}

          {viewMode === 'detail' && <DetailTabWithFilter details={details} />}
          {viewMode === 'purchase-orders' && <PurchaseOrdersTab selectedDate={selectedDate} />}
          {viewMode === 'receiving' && <ReceivingTab orderId={order.id} />}
          {viewMode === 'payment' && <PaymentTab details={details} orderId={order.id} />}
        </>
      )}

      {/* orderedCount 只保留給未來可能用到的進度顯示 */}
      {orderedCount > 0 && false}
    </div>
  )
}
