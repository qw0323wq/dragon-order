'use client'

/**
 * 訂單管理頁面（含叫貨單）
 * Tab: 彙總 | 明細(可編輯) | 叫貨單 | 驗收 | 付款
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  LayoutList, LayoutGrid, CalendarDays, ChevronLeft, ChevronRight,
  Loader2, ClipboardCheck, CreditCard, PlusCircle, FileText,
  Download, Printer, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { sumBy, formatCurrency } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

import {
  formatDate, formatDisplay, addDays, groupBySupplier,
  STATUS_LABELS, STATUS_COLORS,
  type Order, type OrderDetail,
} from './_components/types'
import { SupplierOrderCard } from './_components/supplier-order-card'
import { ReceivingTab } from './_components/receiving-tab'
import { PaymentTab } from './_components/payment-tab'
import { DetailTable } from './_components/detail-table'

// ── 叫貨單型別 ──
interface POItem {
  id: number; itemName: string; itemUnit: string; storeName: string
  quantity: string; notes: string | null; costPrice: number
}
interface PurchaseOrder {
  id: number; poNumber: string; supplierName: string; supplierCategory: string
  status: string; totalAmount: number; items: POItem[]
}

type ViewMode = 'summary' | 'detail' | 'purchase-orders' | 'receiving' | 'payment'

// ── 品項選擇器（新增品項用） ──
interface ItemOption { id: number; name: string; unit: string; category: string; costPrice: number }
interface StoreOption { id: number; name: string }

export default function OrdersPage() {
  const today = formatDate(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMode, setViewMode] = useState<ViewMode>('summary')
  const [orderedSuppliers, setOrderedSuppliers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<Order | null>(null)
  const [details, setDetails] = useState<OrderDetail[]>([])

  // （編輯功能已移到彙總卡片）

  // 叫貨單
  const [pos, setPOs] = useState<PurchaseOrder[]>([])
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const isToday = selectedDate === today

  // （品項+門市載入已不需要，新增品項從叫貨頁操作）

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
    } catch { toast.error('載入訂單失敗') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchOrder(selectedDate) }, [selectedDate, fetchOrder])

  // 叫貨單載入
  const fetchPOs = useCallback(async () => {
    try {
      const res = await fetch(`/api/purchase-orders?date=${selectedDate}`)
      const data = await res.json()
      setPOs(data.purchaseOrders || [])
    } catch {}
  }, [selectedDate])

  useEffect(() => { if (viewMode === 'purchase-orders') fetchPOs() }, [viewMode, fetchPOs])

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

  // （編輯/刪除操作已移到 SupplierOrderCard 元件內）

  async function handleDeleteOrder() {
    if (!order || !confirm('確定要刪除這整張訂單？所有品項都會被刪除。')) return
    const res = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('訂單已刪除')
      setOrder(null); setDetails([])
    } else { toast.error('刪除失敗') }
  }

  // ── 叫貨單操作 ──
  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || '產生失敗'); return }
      toast.success(data.message)
      fetchPOs()
    } catch { toast.error('產生失敗') }
    finally { setGenerating(false) }
  }

  async function copyPOText(po: PurchaseOrder) {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}?export=1`)
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      setCopiedId(po.id)
      toast.success(`已複製 ${po.supplierName} 叫貨單`)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { toast.error('複製失敗') }
  }

  // 下載文字檔
  async function downloadPOText(po: PurchaseOrder) {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}?export=1`)
      const text = await res.text()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${po.poNumber}_${po.supplierName}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`已下載 ${po.supplierName} 叫貨單`)
    } catch { toast.error('下載失敗') }
  }

  // 列印叫貨單（開新視窗）
  function printPO(po: PurchaseOrder) {
    const { storeNames, grouped } = groupPOItems(po.items)
    const rows = grouped.map(g => {
      const storeCells = storeNames.map(s => `<td style="text-align:center;padding:6px;border:1px solid #ddd">${g.stores[s] || ''}</td>`).join('')
      return `<tr>
        <td style="padding:6px;border:1px solid #ddd;font-weight:500">${g.itemName}</td>
        ${storeCells}
        <td style="text-align:center;padding:6px;border:1px solid #ddd;font-weight:700">${g.total}</td>
        <td style="padding:6px;border:1px solid #ddd">${g.itemUnit}</td>
        ${g.notes ? `<td style="padding:6px;border:1px solid #ddd;font-size:12px">${g.notes}</td>` : ''}
      </tr>`
    }).join('')

    const storeHeaders = storeNames.map(s => `<th style="text-align:center;padding:6px;border:1px solid #ddd">${s}</th>`).join('')
    const hasNotes = grouped.some(g => g.notes)

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${po.poNumber} - ${po.supplierName}</title>
      <style>body{font-family:"PingFang TC","Noto Sans TC",sans-serif;padding:20px;max-width:800px;margin:0 auto}
      table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#f5f5f5;padding:6px;border:1px solid #ddd;font-size:13px}
      @media print{body{padding:10px}}</style></head><body>
      <h2 style="margin:0">叫貨單 ${po.poNumber}</h2>
      <p style="color:#666;margin:4px 0">供應商：${po.supplierName}　日期：${selectedDate}</p>
      <table><thead><tr>
        <th style="text-align:left">品名</th>${storeHeaders}
        <th style="text-align:center">合計</th><th>單位</th>
        ${hasNotes ? '<th>備註</th>' : ''}
      </tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:20px;color:#999;font-size:12px">肥龍老火鍋 採購系統</p>
      <script>window.onload=()=>window.print()</script></body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  function groupPOItems(poItems: POItem[]) {
    const storeNames = [...new Set(poItems.map(i => i.storeName))].sort()
    const map = new Map<string, { itemName: string; itemUnit: string; notes: string | null; costPrice: number; stores: Record<string, number>; total: number }>()
    for (const pi of poItems) {
      const key = pi.itemName
      if (!map.has(key)) map.set(key, { itemName: pi.itemName, itemUnit: pi.itemUnit, notes: pi.notes, costPrice: pi.costPrice, stores: {}, total: 0 })
      const entry = map.get(key)!
      const qty = parseFloat(pi.quantity) || 0
      entry.stores[pi.storeName] = (entry.stores[pi.storeName] || 0) + qty
      entry.total += qty
    }
    return { storeNames, grouped: [...map.values()] }
  }

  const orderedCount = orderedSuppliers.size
  const orderStatus = order ? STATUS_LABELS[order.status] || order.status : '無訂單'

  const tabClass = (mode: ViewMode) =>
    `h-8 text-xs px-3 rounded-md font-medium transition-colors ${
      viewMode === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:text-foreground'
    }`

  // （新增品項相關狀態已移除）

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
                <SupplierOrderCard key={supplier} supplier={supplier} items={items} ordered={orderedSuppliers.has(supplier)} onMarkOrdered={toggleOrdered}
                  orderId={order?.id} onRefresh={() => fetchOrder(selectedDate)} />
              ))}
            </div>
          )}

          {/* 明細（唯讀+門市篩選） */}
          {viewMode === 'detail' && (
            <DetailTabWithFilter details={details} />
          )}

          {/* 叫貨單 */}
          {viewMode === 'purchase-orders' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={handleGenerate} disabled={generating} className="gap-1.5">
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                  {generating ? '產生中...' : '產生叫貨單'}
                </Button>
              </div>

              {pos.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">
                  <FileText className="size-8 mx-auto mb-2 opacity-50" />
                  <p>尚無叫貨單，按「產生叫貨單」從訂單自動拆單</p>
                </CardContent></Card>
              ) : pos.map(po => {
                const { storeNames, grouped } = groupPOItems(po.items)
                const stColor = po.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : po.status === 'confirmed' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                return (
                  <Card key={po.id}>
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{po.supplierName}</span>
                        <Badge className={stColor}>{po.status === 'draft' ? '待確認' : po.status === 'confirmed' ? '已確認' : '已送出'}</Badge>
                        <span className="text-xs text-muted-foreground">{grouped.length} 品項</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 px-2" onClick={() => copyPOText(po)}>
                          {copiedId === po.id ? '✓ 已複製' : '複製'}
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 px-2" onClick={() => downloadPOText(po)} title="下載文字檔">
                          <Download className="size-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1 text-xs h-7 px-2" onClick={() => printPO(po)} title="列印/存PDF">
                          <Printer className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <CardContent className="pt-0 px-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="text-xs text-muted-foreground border-b">
                            <th className="text-left py-1.5 pl-4 font-normal">品名</th>
                            {storeNames.map(s => <th key={s} className="text-center py-1.5 font-normal">{s}</th>)}
                            <th className="text-center py-1.5 font-semibold">合計</th>
                            <th className="text-left py-1.5 font-normal">單位</th>
                            {grouped.some(g => g.notes) && <th className="text-left py-1.5 font-normal">備註</th>}
                          </tr></thead>
                          <tbody>{grouped.map(g => (
                            <tr key={g.itemName} className="border-b border-border/50">
                              <td className="py-1.5 pl-4 font-medium">{g.itemName}</td>
                              {storeNames.map(s => <td key={s} className="text-center">{g.stores[s] || ''}</td>)}
                              <td className="text-center font-semibold">{g.total}</td>
                              <td className="text-xs text-muted-foreground">{g.itemUnit}</td>
                              {grouped.some(gg => gg.notes) && <td className="text-xs text-muted-foreground">{g.notes || ''}</td>}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {viewMode === 'receiving' && <ReceivingTab orderId={order.id} />}
          {viewMode === 'payment' && <PaymentTab details={details} orderId={order.id} />}
        </>
      )}

      {/* 新增品項請從叫貨頁操作 */}
    </div>
  )
}

// ── 明細（唯讀+門市篩選） ──
function DetailTabWithFilter({ details }: { details: OrderDetail[] }) {
  const [storeFilter, setStoreFilter] = useState('all')
  const storeNames = [...new Set(details.map(d => d.storeName))].sort()
  const filtered = storeFilter === 'all' ? details : details.filter(d => d.storeName === storeFilter)
  const total = sumBy(filtered, d => d.subtotal)

  return (
    <div className="space-y-3">
      {/* 門市篩選 */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setStoreFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            storeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
          全部 ({details.length})
        </button>
        {storeNames.map(name => {
          const count = details.filter(d => d.storeName === name).length
          return (
            <button key={name} onClick={() => setStoreFilter(name)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                storeFilter === name ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
              {name} ({count})
            </button>
          )
        })}
      </div>
      <Card>
        <CardContent className="pt-4 px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 pl-4 font-normal">品項</th>
                  <th className="text-left py-2 font-normal">叫貨人</th>
                  {storeFilter === 'all' && <th className="text-left py-2 font-normal">門市</th>}
                  <th className="text-left py-2 font-normal">供應商</th>
                  <th className="text-right py-2 font-normal">數量</th>
                  <th className="text-left py-2 font-normal">單位</th>
                  <th className="text-right py-2 font-normal">單價</th>
                  <th className="text-right py-2 pr-4 font-normal">小計</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} className="border-b border-border/50">
                    <td className="py-2 pl-4 font-medium">{d.itemName}</td>
                    <td className="py-2 text-xs text-muted-foreground">{d.createdByName || '—'}</td>
                    {storeFilter === 'all' && <td className="py-2 text-xs text-muted-foreground">{d.storeName}</td>}
                    <td className="py-2 text-xs text-muted-foreground">{d.supplierName}</td>
                    <td className="py-2 text-right tabular-nums">{parseFloat(d.quantity)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{d.unit}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">${d.unitPrice}</td>
                    <td className="py-2 text-right tabular-nums pr-4">${d.subtotal}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pl-4" colSpan={storeFilter === 'all' ? 6 : 5}>合計</td>
                  <td className="py-2 text-right pr-4" colSpan={2}>{formatCurrency(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
