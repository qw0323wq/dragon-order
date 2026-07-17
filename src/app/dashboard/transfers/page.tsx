'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  ArrowRightLeft, Plus, Loader2, RotateCcw, CheckCircle2, PackageSearch, Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatAmount } from '@/lib/format'
import { cn } from '@/lib/utils'

// ── 型別 ──

interface TransferItem {
  id: number
  item_id: number
  item_name: string
  item_unit: string
  quantity: number
  returned_qty: number
  unit: string | null
}

interface Transfer {
  id: number
  transfer_number: string
  type: string
  from_store_id: number
  to_store_id: number
  from_store_name: string
  to_store_name: string
  status: string
  notes: string | null
  created_by_name: string | null
  created_at: string
  settled_at: string | null
  items: TransferItem[]
}

interface StoreOption { id: number; name: string }
interface ItemOption { id: number; name: string; unit: string; category: string }

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待確認', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' },
  confirmed: { label: '已確認', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  returned: { label: '已歸還', color: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' },
  // 中性狀態改用語意 token，深色自動適應（原本 bg-gray-100 text-gray-700 是淺色專用）
  settled: { label: '已沖銷', color: 'bg-muted text-muted-foreground' },
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [allItems, setAllItems] = useState<ItemOption[]>([])
  const [statusFilter, setStatusFilter] = useState('all')

  // 新增 Dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [formType, setFormType] = useState<'transfer' | 'borrow'>('borrow')
  const [formFrom, setFormFrom] = useState('')
  const [formTo, setFormTo] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<{ itemId: string; quantity: string }[]>([{ itemId: '', quantity: '' }])
  const [submitting, setSubmitting] = useState(false)

  // 歸還 Dialog
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnTarget, setReturnTarget] = useState<Transfer | null>(null)
  const [returnQtys, setReturnQtys] = useState<Record<number, string>>({})
  const [returning, setReturning] = useState(false)

  // 品項搜尋
  const [itemSearchText, setItemSearchText] = useState<Record<number, string>>({})
  const [itemDropdownOpen, setItemDropdownOpen] = useState<Record<number, boolean>>({})

  const fetchTransfers = useCallback(async () => {
    setLoading(true)
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/transfers${params}`)
      if (res.ok) setTransfers(await res.json())
    } catch { toast.error('載入失敗') }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { fetchTransfers() }, [fetchTransfers])

  useEffect(() => {
    Promise.all([
      fetch('/api/stores').then(r => r.json()),
      fetch('/api/items').then(r => r.json()),
    ]).then(([s, i]) => {
      setStores(s)
      setAllItems(i)
    }).catch(() => toast.error('載入資料失敗'))
  }, [])

  // 新增調撥
  async function handleCreate() {
    if (!formFrom || !formTo) { toast.error('請選擇門市'); return }
    const validItems = formItems.filter(i => i.itemId && parseFloat(i.quantity) > 0)
    if (!validItems.length) { toast.error('請至少加一個品項'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: formType,
          fromStoreId: parseInt(formFrom),
          toStoreId: parseInt(formTo),
          notes: formNotes || undefined,
          items: validItems.map(i => ({ itemId: parseInt(i.itemId), quantity: parseFloat(i.quantity) })),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`${formType === 'borrow' ? '借料' : '調撥'}完成：${data.transferNumber}`)
        setCreateOpen(false)
        setFormItems([{ itemId: '', quantity: '' }])
        setFormNotes('')
        fetchTransfers()
      } else {
        toast.error(data.error)
      }
    } catch { toast.error('操作失敗') }
    finally { setSubmitting(false) }
  }

  // 歸還
  function openReturn(t: Transfer) {
    setReturnTarget(t)
    const qtys: Record<number, string> = {}
    t.items.forEach(i => {
      const remaining = i.quantity - i.returned_qty
      if (remaining > 0) qtys[i.id] = String(remaining)
    })
    setReturnQtys(qtys)
    setReturnOpen(true)
  }

  async function handleReturn() {
    if (!returnTarget) return
    const returnItems = Object.entries(returnQtys)
      .filter(([, q]) => parseFloat(q) > 0)
      .map(([id, q]) => ({ transferItemId: parseInt(id), returnQty: parseFloat(q) }))

    if (!returnItems.length) { toast.error('沒有要歸還的品項'); return }

    setReturning(true)
    try {
      const res = await fetch(`/api/transfers/${returnTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'return', returnItems }),
      })
      if (res.ok) {
        toast.success('歸還完成')
        setReturnOpen(false)
        fetchTransfers()
      } else {
        const data = await res.json()
        toast.error(data.error)
      }
    } catch { toast.error('操作失敗') }
    finally { setReturning(false) }
  }

  // 沖銷
  async function handleSettle(t: Transfer) {
    if (!confirm(`確定要沖銷 ${t.transfer_number}？（不歸還，視為消耗）`)) return
    const res = await fetch(`/api/transfers/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'settle' }),
    })
    if (res.ok) {
      toast.success('已沖銷')
      fetchTransfers()
    }
  }

  const borrowCount = transfers.filter(t => t.type === 'borrow' && t.status === 'confirmed').length
  // 顯示用：進行中 = 已確認但尚未歸還/沖銷
  const activeCount = transfers.filter(t => t.status === 'confirmed').length

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">門市調撥/借料</h2>
          <p className="text-sm text-muted-foreground">兩店之間的撥貨與借料紀錄</p>
        </div>
        <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" /> 新增
        </Button>
      </div>

      {/* 指標卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="調撥紀錄"
          value={formatAmount(transfers.length)}
          icon={ArrowRightLeft}
          accent="bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
          hint="筆（依目前篩選）"
        />
        <StatCard
          label="進行中"
          value={formatAmount(activeCount)}
          icon={Clock}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
          hint="尚未歸還或沖銷"
        />
        <StatCard
          label="未歸還借料"
          value={formatAmount(borrowCount)}
          icon={RotateCcw}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
          hint={borrowCount > 0 ? '記得追回' : '都已結清'}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* 篩選 */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          { value: 'all', label: '全部' },
          { value: 'confirmed', label: '進行中' },
          { value: 'returned', label: '已歸還' },
          { value: 'settled', label: '已沖銷' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 載入中...
        </div>
      ) : transfers.length === 0 ? (
        <EmptyState
          icon={statusFilter === 'all' ? ArrowRightLeft : PackageSearch}
          title={statusFilter === 'all' ? '尚無調撥紀錄' : '這個狀態下沒有紀錄'}
          description={
            statusFilter === 'all'
              ? '兩店互相借料或撥貨時，按「新增」建立一筆，系統會自動調整雙方庫存。'
              : '切換上方的狀態篩選看看其他紀錄，或建立一筆新的調撥。'
          }
          action={
            statusFilter === 'all' ? (
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" /> 新增調撥/借料
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setStatusFilter('all')}>
                看全部紀錄
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {transfers.map(t => {
            const st = STATUS_MAP[t.status] || STATUS_MAP.confirmed
            const isBorrow = t.type === 'borrow'
            const hasUnreturned = isBorrow && t.items.some(i => i.quantity > i.returned_qty)
            const isActive = t.status === 'confirmed'

            return (
              <Card key={t.id} className="ring-1 ring-foreground/10 transition-shadow hover:shadow-sm">
                <CardContent className="space-y-2.5 px-3 pb-3 pt-4 sm:px-6">
                  {/* 標頭 */}
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ArrowRightLeft className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-mono text-sm font-medium tabular-nums">{t.transfer_number}</span>
                      <Badge variant="secondary" className={cn('text-[10px]', st.color)}>{st.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">{isBorrow ? '借料' : '調撥'}</Badge>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {new Date(t.created_at).toLocaleDateString('zh-TW')}
                    </span>
                  </div>

                  {/* 來源→目標 */}
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-medium">{t.from_store_name}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">{t.to_store_name}</span>
                    {t.created_by_name && <span className="text-xs text-muted-foreground">by {t.created_by_name}</span>}
                  </div>

                  {/* 品項明細 */}
                  <div className="space-y-1 rounded-lg border-l-2 border-border bg-muted/30 py-1.5 pl-2.5 pr-2 text-xs">
                    {t.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{item.item_name}</span>
                        <div className="flex shrink-0 items-center gap-2 tabular-nums">
                          {isBorrow && item.returned_qty > 0 && (
                            <span className="text-green-600 dark:text-green-400">已還 {item.returned_qty}</span>
                          )}
                          {isBorrow && item.quantity > item.returned_qty && isActive && (
                            <span className="text-amber-600 dark:text-amber-400">
                              未還 {(item.quantity - item.returned_qty).toFixed(1)}
                            </span>
                          )}
                          <span className="text-right font-medium text-muted-foreground">
                            {item.quantity} {item.unit || item.item_unit}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}

                  {/* 操作按鈕 */}
                  {isActive && (
                    <div className="flex gap-2 pt-1">
                      {isBorrow && hasUnreturned && (
                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openReturn(t)}>
                          <RotateCcw className="size-3.5" /> 歸還
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => handleSettle(t)}>
                        <CheckCircle2 className="size-3.5" /> 沖銷
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* 新增調撥/借料 Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增調撥/借料</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* 類型 */}
            <div className="flex gap-2">
              {(['borrow', 'transfer'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setFormType(t)}
                  className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                    formType === t
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                  }`}
                >
                  {t === 'borrow' ? '借料（需歸還）' : '調撥（不歸還）'}
                </button>
              ))}
            </div>

            {/* 來源/目標門市 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>從</Label>
                <Select value={formFrom} onValueChange={(v) => setFormFrom(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="選擇門市" /></SelectTrigger>
                  <SelectContent>
                    {stores.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>到</Label>
                <Select value={formTo} onValueChange={(v) => setFormTo(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="選擇門市" /></SelectTrigger>
                  <SelectContent>
                    {stores.filter(s => String(s.id) !== formFrom).map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 品項列表 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>品項</Label>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1"
                  onClick={() => setFormItems(prev => [...prev, { itemId: '', quantity: '' }])}>
                  <Plus className="size-3.5" /> 加品項
                </Button>
              </div>
              {formItems.map((fi, idx) => {
                const searchText = itemSearchText[idx] ?? ''
                const isOpen = itemDropdownOpen[idx] ?? false
                const selectedItem = fi.itemId ? allItems.find(i => i.id === parseInt(fi.itemId)) : null
                const filtered = searchText
                  ? allItems.filter(i => i.name.includes(searchText))
                  : allItems.slice(0, 50)

                return (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      {selectedItem ? (
                        <div className="flex items-center gap-1 border rounded-md px-2 py-1.5 text-sm bg-muted/30">
                          <span className="truncate">{selectedItem.name}</span>
                          <button type="button" className="ml-auto text-muted-foreground hover:text-foreground"
                            onClick={() => setFormItems(prev => prev.map((p, i) => i === idx ? { ...p, itemId: '' } : p))}>
                            <span className="text-xs">✕</span>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <Input placeholder="搜尋品項..." value={searchText}
                            onChange={e => {
                              setItemSearchText(prev => ({ ...prev, [idx]: e.target.value }))
                              setItemDropdownOpen(prev => ({ ...prev, [idx]: true }))
                            }}
                            onFocus={() => setItemDropdownOpen(prev => ({ ...prev, [idx]: true }))}
                          />
                          {isOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setItemDropdownOpen(prev => ({ ...prev, [idx]: false }))} />
                              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border bg-card shadow-lg">
                                {filtered.length === 0 ? (
                                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                    找不到「{searchText}」，換個關鍵字試試
                                  </p>
                                ) : (
                                  filtered.map(it => (
                                    <button key={it.id} type="button"
                                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                                      onClick={() => {
                                        setFormItems(prev => prev.map((p, i) => i === idx ? { ...p, itemId: String(it.id) } : p))
                                        setItemSearchText(prev => { const n = { ...prev }; delete n[idx]; return n })
                                        setItemDropdownOpen(prev => ({ ...prev, [idx]: false }))
                                      }}>
                                      <span className="min-w-0 truncate">{it.name}</span>
                                      <span className="shrink-0 text-xs text-muted-foreground">{it.category}</span>
                                    </button>
                                  ))
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <Input type="number" min={0} step="0.1" placeholder="數量" className="w-20 text-right tabular-nums"
                      value={fi.quantity}
                      onChange={e => setFormItems(prev => prev.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p))}
                    />
                    {formItems.length > 1 && (
                      <Button variant="ghost" size="icon" title="移除品項" className="size-8 shrink-0 text-destructive hover:bg-destructive/10"
                        onClick={() => setFormItems(prev => prev.filter((_, i) => i !== idx))}>✕</Button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="space-y-1.5">
              <Label>備註</Label>
              <Textarea rows={2} value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="選填..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? '處理中...' : '確認'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 歸還 Dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>歸還借料 — {returnTarget?.transfer_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {returnTarget?.to_store_name} → 還給 {returnTarget?.from_store_name}
            </p>
            {returnTarget?.items.filter(i => i.quantity > i.returned_qty).map(item => {
              const remaining = item.quantity - item.returned_qty
              return (
                <div key={item.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{item.item_name}</span>
                    <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                      (未還 {remaining.toFixed(1)} {item.unit || item.item_unit})
                    </span>
                  </div>
                  <Input type="number" min={0} max={remaining} step="0.1" className="w-20 shrink-0 text-right tabular-nums"
                    value={returnQtys[item.id] ?? ''}
                    onChange={e => setReturnQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                  />
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>取消</Button>
            <Button onClick={handleReturn} disabled={returning}>
              {returning ? '處理中...' : '確認歸還'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
