'use client'

/**
 * 預約改價排程管理頁
 * 管理員可新增/查看/取消預約改價排程
 * Cron 每天 05:00 自動執行到期排程
 */

import { useEffect, useState, useCallback } from 'react'
import { CalendarClock, Plus, X, Check, Clock, Ban, TrendingUp, TrendingDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        newCostPrice: parseInt(formData.newCostPrice),
        newStorePrice: formData.newStorePrice ? parseInt(formData.newStorePrice) : null,
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
    ? parseInt(formData.newCostPrice) - selectedItem.costPrice
    : null

  return (
    <div className="space-y-4">
      {/* 頂部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          <h1 className="text-lg font-bold">預約改價</h1>
          <span className="text-sm text-gray-500">
            ({schedules.length} 筆)
          </span>
        </div>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-1" />
          新增排程
        </Button>
      </div>

      {/* 篩選 */}
      <div className="flex gap-2">
        {['pending', 'applied', 'cancelled', ''].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors',
              statusFilter === s
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            )}
          >
            {s === 'pending' ? '⏳ 待執行' : s === 'applied' ? '✅ 已生效' : s === 'cancelled' ? '❌ 已取消' : '全部'}
          </button>
        ))}
      </div>

      {/* 排程列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>目前沒有{statusFilter === 'pending' ? '待執行的' : ''}排程</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => {
            const diff = s.newCostPrice - s.currentCostPrice
            const isUp = diff > 0
            return (
              <div
                key={s.id}
                className={cn(
                  'border rounded-lg p-4',
                  s.status === 'pending' ? 'bg-amber-50 border-amber-200' :
                  s.status === 'applied' ? 'bg-green-50 border-green-200' :
                  'bg-gray-50 border-gray-200'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.itemName}</span>
                      <span className="text-xs text-gray-400">{s.itemSku}</span>
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{s.supplierName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500">{s.currentCostPrice}元/{s.itemUnit}</span>
                      <span>→</span>
                      <span className={cn('font-bold', isUp ? 'text-red-600' : 'text-green-600')}>
                        {s.newCostPrice}元/{s.itemUnit}
                      </span>
                      <span className={cn('text-xs', isUp ? 'text-red-500' : 'text-green-500')}>
                        {isUp ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                        {' '}{isUp ? '+' : ''}{diff}元
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {s.effectiveDate} 生效
                      </span>
                      {s.source && <span>來源：{s.source}</span>}
                      {s.notes && <span>備註：{s.notes}</span>}
                      {s.appliedAt && <span>執行於：{new Date(s.appliedAt).toLocaleDateString('zh-TW')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {s.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(s.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                    {s.status === 'applied' && <Check className="h-5 w-5 text-green-500" />}
                    {s.status === 'cancelled' && <X className="h-5 w-5 text-gray-400" />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新增 Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">新增預約改價</h2>
              <button onClick={() => setShowDialog(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 供應商 */}
            <div>
              <label className="block text-sm font-medium mb-1">供應商</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
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
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={formData.itemId}
                onChange={(e) => setFormData({ ...formData, itemId: e.target.value, newCostPrice: '' })}
                disabled={!selectedSupplier}
              >
                <option value="">選擇品項</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — 現價 {i.costPrice}元/{i.unit}
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
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={formData.newCostPrice}
                  onChange={(e) => setFormData({ ...formData, newCostPrice: e.target.value })}
                  placeholder="元"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">新店家價</label>
                <input
                  type="number"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={formData.newStorePrice}
                  onChange={(e) => setFormData({ ...formData, newStorePrice: e.target.value })}
                  placeholder="選填"
                />
              </div>
            </div>

            {/* 價差預覽 */}
            {priceDiff !== null && selectedItem && (
              <div className={cn(
                'text-sm px-3 py-2 rounded',
                priceDiff > 0 ? 'bg-red-50 text-red-700' : priceDiff < 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'
              )}>
                {selectedItem.costPrice}元 → {formData.newCostPrice}元
                （{priceDiff > 0 ? '漲' : '降'} {Math.abs(priceDiff)} 元，
                {selectedItem.costPrice > 0 ? `${((Math.abs(priceDiff) / selectedItem.costPrice) * 100).toFixed(1)}%` : '—'}）
              </div>
            )}

            {/* 生效日期 */}
            <div>
              <label className="block text-sm font-medium mb-1">生效日期 *</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm"
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
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  placeholder="如：鉊玖通知"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">備註</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
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
