'use client'

/**
 * 訂單管理頁面（含叫貨單）
 *
 * 雙模式（2026-07-16 參考 Costflows 改為列表優先）：
 *   列表模式（預設）— 日期範圍 + 衍生狀態 pills + 訂單列表，點一筆進單日視圖
 *   單日模式（?date=YYYY-MM-DD 或 ?tab=…）— 彙總 | 明細 | 叫貨單 | 驗收 | 付款
 *
 * 拆分（P2-C9，2026-04-24）：
 *   _components/types.ts                    — 共用型別（含 PO 型別、衍生工作流狀態）
 *   _components/orders-list-view.tsx        — 列表模式（範圍快選 + 狀態 pills + 列表）
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
  Loader2, ClipboardCheck, CreditCard, PlusCircle, FileText, Trash2, ArrowLeft, History,
  ClipboardList,
} from 'lucide-react'
import Link from 'next/link'
import { sumBy, formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

import {
  formatDate, formatDisplay, addDays, groupBySupplier,
  STATUS_LABELS, STATUS_COLORS,
  type Order, type OrderDetail,
} from './_components/types'
import { OrdersListView, type ListFilter } from './_components/orders-list-view'
import { SupplierOrderCard } from './_components/supplier-order-card'
import { ReceivingTab } from './_components/receiving-tab'
import { ReceivingDiffSummary } from './_components/receiving-diff-summary'
import { OrderHistoryDialog } from './_components/order-history-dialog'
import { PaymentTab } from './_components/payment-tab'
import { DetailTabWithFilter } from './_components/detail-tab-with-filter'
import { PurchaseOrdersTab } from './_components/purchase-orders-tab'

type ViewMode = 'summary' | 'detail' | 'purchase-orders' | 'receiving' | 'payment'
const VALID_VIEW_MODES: ViewMode[] = ['summary', 'detail', 'purchase-orders', 'receiving', 'payment']

/** 頁面模式：list = 訂單列表（預設）；day = 單日五 tab 視圖；null = URL 尚未解析 */
type PageMode = 'list' | 'day'

const VALID_FILTERS: ListFilter[] = ['all', 'pending-receiving', 'pending-payment', 'done', 'cancelled', 'empty']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default function OrdersPage() {
  const today = formatDate(new Date())
  const [mode, setMode] = useState<PageMode | null>(null)
  const [initialFilter, setInitialFilter] = useState<ListFilter>('all')
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMode, setViewMode] = useState<ViewMode>('summary')

  // URL 判斷模式：?date= 或 ?tab=（purchase-orders 頁深連結）→ 單日；?filter= → 列表帶初始 pill
  // 用 useEffect 避免 useSearchParams 的 Suspense 要求（wrap 整頁太繁瑣）
  const parseUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const urlDate = params.get('date')
    const urlTab = params.get('tab') as ViewMode | null
    const urlFilter = params.get('filter') as ListFilter | null
    if (urlTab && VALID_VIEW_MODES.includes(urlTab)) setViewMode(urlTab)
    if (urlDate && DATE_RE.test(urlDate)) {
      setSelectedDate(urlDate)
      setMode('day')
      return
    }
    if (urlTab && VALID_VIEW_MODES.includes(urlTab)) {
      setMode('day')
      return
    }
    if (urlFilter && VALID_FILTERS.includes(urlFilter)) setInitialFilter(urlFilter)
    setMode('list')
  }, [])

  useEffect(() => {
    parseUrl()
    // 瀏覽器返回鍵：重新解析 URL，讓 列表 ⇄ 單日 跟著歷史紀錄走
    window.addEventListener('popstate', parseUrl)
    return () => window.removeEventListener('popstate', parseUrl)
  }, [parseUrl])

  const [orderedSuppliers, setOrderedSuppliers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<Order | null>(null)
  const [details, setDetails] = useState<OrderDetail[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)

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

  useEffect(() => {
    if (mode === 'day') fetchOrder(selectedDate)
  }, [mode, selectedDate, fetchOrder])

  const supplierGroups = useMemo(() => groupBySupplier(details), [details])
  const grandTotal = useMemo(() => sumBy(details, d => d.subtotal), [details])

  /** 進單日視圖（列表點行 / 日期導航共用），同步 URL 讓返回鍵可回列表 */
  function openDay(date: string) {
    setSelectedDate(date)
    if (mode !== 'day') {
      setMode('day')
      window.history.pushState(null, '', `/dashboard/orders?date=${date}`)
    } else {
      window.history.replaceState(null, '', `/dashboard/orders?date=${date}`)
    }
  }

  function backToList() {
    setMode('list')
    window.history.pushState(null, '', '/dashboard/orders')
  }

  function toggleOrdered(supplier: string) {
    setOrderedSuppliers(prev => {
      const next = new Set(prev)
      if (next.has(supplier)) next.delete(supplier); else next.add(supplier)
      return next
    })
  }

  function goDay(offset: number) { openDay(addDays(selectedDate, offset)) }

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

  const orderStatus = order ? STATUS_LABELS[order.status] || order.status : '無訂單'

  const tabClass = (m: ViewMode) =>
    `inline-flex min-h-8 items-center text-xs px-3 rounded-md font-medium transition-colors ${
      viewMode === m
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
    }`

  // URL 未解析完成（首次 render 的一瞬間）
  if (mode === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── 列表模式 ──────────────────────────────────────────────
  if (mode === 'list') {
    return (
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-xl font-semibold">訂單管理</h2>
          <Link href="/order">
            <Button size="sm" className="gap-1.5"><PlusCircle className="size-3.5" /> 新增訂單</Button>
          </Link>
          <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={() => openDay(today)}>
            <CalendarDays className="size-3.5" /> 今日訂單
          </Button>
        </div>
        <OrdersListView initialFilter={initialFilter} onSelectDate={openDay} />
      </div>
    )
  }

  // ── 單日模式（原有五 tab 視圖） ────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 頂部 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground" onClick={backToList}>
              <ArrowLeft className="size-4" /> 列表
            </Button>
            <h2 className="font-heading text-xl font-semibold">訂單管理</h2>
            <Link href="/order">
              <Button size="sm" className="gap-1.5"><PlusCircle className="size-3.5" /> 新增訂單</Button>
            </Link>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="icon" className="size-8" onClick={() => goDay(-1)}><ChevronLeft className="size-4" /></Button>
            <div className="flex items-center gap-1.5 text-sm font-medium tabular-nums min-w-[180px] justify-center">
              <CalendarDays className="size-3.5 text-muted-foreground" />{formatDisplay(selectedDate)}
            </div>
            <Button variant="outline" size="icon" className="size-8" onClick={() => goDay(1)} disabled={isToday}><ChevronRight className="size-4" /></Button>
            {!isToday && <Button variant="ghost" size="sm" onClick={() => openDay(today)}>回今天</Button>}
          </div>
          {order && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className={STATUS_COLORS[order.status] || ''}>{orderStatus}</Badge>
              {order.createdByName && <span className="text-xs text-muted-foreground">建單人：{order.createdByName}</span>}
              <Button variant="ghost" size="sm" className="text-xs h-8 px-2" onClick={() => setHistoryOpen(true)}>
                <History className="size-3 mr-1" /> 歷史
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-destructive h-8 px-2" onClick={handleDeleteOrder}>
                <Trash2 className="size-3 mr-1" /> 刪除訂單
              </Button>
            </div>
          )}
        </div>
        {order && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">採購總計</p>
            <p className="text-xl font-bold font-heading tabular-nums text-primary">{formatCurrency(grandTotal)}</p>
          </div>
        )}
      </div>

      {loading && <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}

      {!loading && !order && (
        <EmptyState
          icon={ClipboardList}
          title={`${formatDisplay(selectedDate)} 沒有訂單`}
          description="這天還沒有人叫貨。可以新增一張訂單，或用上方箭頭切換到其他日期。"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/order">
                <Button size="sm" className="gap-1.5"><PlusCircle className="size-3.5" /> 新增訂單</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={backToList}>回訂單列表</Button>
            </div>
          }
        />
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
          <OrderHistoryDialog orderId={order.id} open={historyOpen} onOpenChange={setHistoryOpen} />
          {viewMode === 'receiving' && (
            <div className="space-y-4">
              <ReceivingDiffSummary details={details} />
              <ReceivingTab orderId={order.id} onSaved={() => fetchOrder(selectedDate)} />
            </div>
          )}
          {viewMode === 'payment' && <PaymentTab details={details} orderId={order.id} />}
        </>
      )}
    </div>
  )
}
