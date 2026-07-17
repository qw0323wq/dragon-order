'use client'

/**
 * 預約改價排程管理頁
 * 管理員可新增/查看/取消預約改價排程
 * Cron 每天 05:00 自動執行到期排程
 */

import { useEffect, useState, useCallback } from 'react'
import { CalendarClock, Plus, X, Check, Clock, Ban, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DeltaBadge } from '@/components/ui/delta-badge'
import { formatCurrency, formatAmount, roundMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Schedule {
  id: number
  itemId: number
  itemName: string
  itemSku: string
  currentCostPrice: number
  currentStorePrice: number
  itemUnit: string
  supplierName: string
  supplierCode: string
  newCostPrice: number
  newStorePrice: number | null
  effectiveDate: string
  source: string | null
  notes: string | null
  status: string
  createdAt: string
  appliedAt: string | null
}

interface Item {
  id: number
  name: string
  sku: string
  costPrice: number
  storePrice: number
  unit: string
  supplierName?: string
}

interface Supplier {
  id: number
  name: string
  code: string
}

/** 指標卡標題（隨狀態篩選切換；'' = 全部） */
const STAT_LABEL: Record<string, string> = {
  pending: '待執行排程',
  applied: '已生效排程',
  cancelled: '已取消排程',
  '': '全部排程',
}

/** 空狀態標題用的狀態字樣 */
const STATUS_EMPTY_LABEL: Record<string, string> = {
  pending: '待執行的',
  applied: '已生效的',
  cancelled: '已取消的',
  '': '',
}

export default function PriceSchedulePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('pending')

  // 新增表單
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')
  const [items, setItems] = useState<Item[]>([])
  const [formData, setFormData] = useState({
    itemId: '',
    newCostPrice: '',
    newStorePrice: '',
    effectiveDate: '',
    source: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    const url = statusFilter
      ? `/api/price-schedule?status=${statusFilter}`
      : '/api/price-schedule'
    const res = await fetch(url)
    const data = await res.json()
    setSchedules(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  useEffect(() => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  async function loadItems(supplierId: string) {
    const res = await fetch(`/api/suppliers/${supplierId}/items`)
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
  }

  async function handleSubmit() {
    if (!formData.itemId || !formData.newCostPrice || !formData.effectiveDate) return
    setSubmitting(true)

    const res = await fetch('/api/price-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId: parseInt(formData.itemId),
        // 金額保留小數（$63.3/公斤 這種），不要 parseInt 砍掉
        newCostPrice: parseFloat(formData.newCostPrice),
        newStorePrice: formData.newStorePrice ? parseFloat(formData.newStorePrice) : null,
        effectiveDate: formData.effectiveDate,
        source: formData.source || null,
        notes: formData.notes || null,
      }),
    })

    if (res.ok) {
      setShowDialog(false)
      setFormData({ itemId: '', newCostPrice: '', newStorePrice: '', effectiveDate: '', source: '', notes: '' })
      setSelectedSupplier('')
      setItems([])
      loadSchedules()
    }
    setSubmitting(false)
  }

  async function handleCancel(id: number) {
    if (!confirm('確定要取消此排程？')) return
    await fetch(`/api/price-schedule/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    loadSchedules()
  }

  const selectedItem = items.find((i) => i.id === parseInt(formData.itemId))
  const priceDiff = selectedItem && formData.newCostPrice
    ? parseFloat(formData.newCostPrice) - selectedItem.costPrice
    : null

  // 指標卡用的漲跌筆數（純顯示，不影響排程邏輯）
  const upCount = schedules.filter((s) => Number(s.newCostPrice) > Number(s.currentCostPrice)).length
  const downCount = schedules.filter((s) => Number(s.newCostPrice) < Number(s.currentCostPrice)).length

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 頂部 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">預約改價</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            先排好生效日，Cron 每天 05:00 自動把到期的新價套進品項
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          新增排程
        </Button>
      </div>

      {/* 指標卡 */}
      {!loading && schedules.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label={STAT_LABEL[statusFilter] ?? '全部排程'}
            value={formatAmount(schedules.length)}
            icon={CalendarClock}
            accent="bg-blue-100 text-blue-600"
            hint="筆排程"
          />
          <StatCard
            label="漲價"
            value={formatAmount(upCount)}
            icon={TrendingUp}
            accent="bg-red-100 text-red-600"
            hint="筆成本調高"
          />
          <StatCard
            label="降價"
            value={formatAmount(downCount)}
            icon={TrendingDown}
            accent="bg-green-100 text-green-600"
            hint="筆成本調低"
          />
        </div>
      )}

      {/* 篩選 */}
      <div className="flex flex-wrap gap-1.5">
        {['pending', 'applied', 'cancelled', ''].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'min-h-8 px-3.5 py-1.5 rounded-lg text-sm border transition-colors',
              statusFilter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-accent'
            )}
          >
            {s === 'pending' ? '待執行' : s === 'applied' ? '已生效' : s === 'cancelled' ? '已取消' : '全部'}
          </button>
        ))}
      </div>

      {/* 排程列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Clock className="size-6 animate-pulse text-muted-foreground" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="rounded-xl bg-card ring-1 ring-foreground/10">
          <EmptyState
            icon={CalendarClock}
            title={`目前沒有${STATUS_EMPTY_LABEL[statusFilter] ?? ''}排程`}
            description={
              statusFilter === 'cancelled'
                ? '被取消的排程會留在這裡備查，不會影響品項價格。'
                : '供應商通知調價時先建一筆排程，到生效日系統會自動幫你改價，不用記在腦子裡。'
            }
            action={
              statusFilter === 'cancelled' ? undefined : (
                <Button size="sm" onClick={() => setShowDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  新增排程
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => {
            const currentCost = Number(s.currentCostPrice)
            const newCost = Number(s.newCostPrice)
            const diff = newCost - currentCost
            const isUp = diff > 0
            const diffPercent = currentCost > 0 ? (diff / currentCost) * 100 : 0
            return (
              <div
                key={s.id}
                className={cn(
                  'rounded-xl p-3 md:p-4 ring-1 transition-shadow hover:shadow-sm',
                  s.status === 'pending' ? 'bg-amber-50 ring-amber-200' :
                  s.status === 'applied' ? 'bg-green-50 ring-green-200' :
                  'bg-muted/40 ring-foreground/10'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.itemName}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{s.itemSku}</span>
                      <span className="text-xs bg-foreground/5 px-2 py-0.5 rounded-md">
                        {s.supplierName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="text-muted-foreground tabular-nums">
                        {formatCurrency(currentCost)}/{s.itemUnit}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          isUp ? 'text-red-600' : 'text-green-600'
                        )}
                      >
                        {formatCurrency(newCost)}/{s.itemUnit}
                      </span>
                      <DeltaBadge
                        percent={diffPercent}
                        amount={`${isUp ? '+' : ''}${formatAmount(roundMoney(diff))} 元`}
                      />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock className="h-3 w-3" />
                        {s.effectiveDate} 生效
                      </span>
                      {s.source && <span>來源：{s.source}</span>}
                      {s.notes && <span>備註：{s.notes}</span>}
                      {s.appliedAt && (
                        <span className="tabular-nums">
                          執行於：{new Date(s.appliedAt).toLocaleDateString('zh-TW')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {s.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(s.id)}
                        title="取消排程"
                        className="size-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-100"
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                    {s.status === 'applied' && (
                      <span title="已生效" className="flex size-8 items-center justify-center">
                        <Check className="h-5 w-5 text-green-600" />
                      </span>
                    )}
                    {s.status === 'cancelled' && (
                      <span title="已取消" className="flex size-8 items-center justify-center">
                        <X className="h-5 w-5 text-muted-foreground" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新增 Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-xl ring-1 ring-foreground/10 shadow-lg p-5 md:p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold">新增預約改價</h2>
              <button
                onClick={() => setShowDialog(false)}
                title="關閉"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 供應商 */}
            <div>
              <label className="block text-sm font-medium mb-1">供應商</label>
              <select
                className="w-full min-h-9 border border-border bg-background rounded-lg px-3 py-2 text-sm"
                value={selectedSupplier}
                onChange={(e) => {
                  setSelectedSupplier(e.target.value)
                  setFormData({ ...formData, itemId: '' })
                  if (e.target.value) loadItems(e.target.value)
                  else setItems([])
                }}
              >
                <option value="">選擇供應商</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* 品項 */}
            <div>
              <label className="block text-sm font-medium mb-1">品項</label>
              <select
                className="w-full min-h-9 border border-border bg-background rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                value={formData.itemId}
                onChange={(e) => setFormData({ ...formData, itemId: e.target.value, newCostPrice: '' })}
                disabled={!selectedSupplier}
              >
                <option value="">選擇品項</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — 現價 {formatCurrency(Number(i.costPrice))}/{i.unit}
                  </option>
                ))}
              </select>
            </div>

            {/* 新價格 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">新進貨價 *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full min-h-9 border border-border bg-background rounded-lg px-3 py-2 text-sm text-right tabular-nums"
                  value={formData.newCostPrice}
                  onChange={(e) => setFormData({ ...formData, newCostPrice: e.target.value })}
                  placeholder="元"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">新店家價</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full min-h-9 border border-border bg-background rounded-lg px-3 py-2 text-sm text-right tabular-nums"
                  value={formData.newStorePrice}
                  onChange={(e) => setFormData({ ...formData, newStorePrice: e.target.value })}
                  placeholder="選填"
                />
              </div>
            </div>

            {/* 價差預覽 */}
            {priceDiff !== null && selectedItem && (
              <div className="flex items-center gap-2 flex-wrap rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground tabular-nums">
                  {formatCurrency(Number(selectedItem.costPrice))}
                </span>
                <span className="text-muted-foreground">→</span>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    priceDiff > 0 ? 'text-red-600' : priceDiff < 0 ? 'text-green-600' : 'text-foreground'
                  )}
                >
                  {formatCurrency(roundMoney(parseFloat(formData.newCostPrice) || 0))}
                </span>
                <DeltaBadge
                  percent={
                    selectedItem.costPrice > 0
                      ? (priceDiff / Number(selectedItem.costPrice)) * 100
                      : 0
                  }
                  amount={`${priceDiff > 0 ? '+' : ''}${formatAmount(roundMoney(priceDiff))} 元`}
                />
              </div>
            )}

            {/* 生效日期 */}
            <div>
              <label className="block text-sm font-medium mb-1">生效日期 *</label>
              <input
                type="date"
                className="w-full min-h-9 border border-border bg-background rounded-lg px-3 py-2 text-sm tabular-nums"
                value={formData.effectiveDate}
                onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
              />
            </div>

            {/* 來源 & 備註 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">來源</label>
                <input
                  type="text"
                  className="w-full min-h-9 border border-border bg-background rounded-lg px-3 py-2 text-sm"
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  placeholder="如：鉊玖通知"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">備註</label>
                <input
                  type="text"
                  className="w-full min-h-9 border border-border bg-background rounded-lg px-3 py-2 text-sm"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="選填"
                />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={!formData.itemId || !formData.newCostPrice || !formData.effectiveDate || submitting}
              onClick={handleSubmit}
            >
              {submitting ? '建立中...' : '建立排程'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
