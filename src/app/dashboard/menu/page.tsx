'use client'

/**
 * 品項管理頁面（接真實 API）
 * 功能：品項列表（搜尋 + 分類篩選）、進貨價 + 店家採購價（採購用，不含售價/毛利）
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Percent, CalendarClock, Eye, EyeOff, Trash2, PackageSearch, SearchX } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonTable } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ── 型別 ──

interface ItemData {
  id: number
  sku: string | null
  name: string
  category: string
  unit: string
  costPrice: number
  storePrice: number      // 有效店家採購價（API 已計算，顯示用）
  rawStorePrice?: number  // 原始手動固定價（0 = 走加成 %）
  storeMarkupPct?: number // 店家採購價加成 %
  supplierId: number
  supplierName: string
  spec: string | null
  supplierNotes: string | null
  minOrderQty: string | null
  packSize: string | null
  storageType: string | null
  isActive: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  肉品: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  海鮮: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  蔬菜: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  菇類: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  豆製品: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  火鍋料: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
  特色: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
  內臟: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400',
  滷煮: 'bg-stone-100 text-stone-700 dark:bg-stone-500/20 dark:text-stone-400',
  底料: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
  飲料: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  酒類: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400',
  甜點: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-400',
  雜貨: 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400',
  耗材: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-400',
}

// ── 頁面 ──

/** 某品項尚未生效的預約改價（用來提醒手動改價會被覆蓋） */
interface PendingSchedule {
  effectiveDate: string
  newCostPrice: number | null
  newStorePrice: number | null
}

export default function MenuPage() {
  const [items, setItems] = useState<ItemData[]>([])
  const [loading, setLoading] = useState(true)
  // itemId → 最近一筆待生效的預約改價
  const [pendingByItem, setPendingByItem] = useState<Map<number, PendingSchedule>>(new Map())
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [supplierFilter, setSupplierFilter] = useState('全部')
  // 顯示已下架品項（才看得到並能「重新上架」或「真刪除」）
  const [showInactive, setShowInactive] = useState(false)
  // 真刪除確認對話框的目標品項
  const [deleteTarget, setDeleteTarget] = useState<ItemData | null>(null)
  const [actingId, setActingId] = useState<number | null>(null)

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ItemData | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 批次設加成 % dialog
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchCategory, setBatchCategory] = useState('全部')
  const [batchPct, setBatchPct] = useState(20)
  const [batchClearManual, setBatchClearManual] = useState(false)
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  // 表單
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formUnit, setFormUnit] = useState('份')
  const [formCostPrice, setFormCostPrice] = useState(0)
  const [formStorePrice, setFormStorePrice] = useState(0)  // 手動固定價（0 = 走加成 %）
  const [formMarkupPct, setFormMarkupPct] = useState(20)   // 加成 %
  const [formSpec, setFormSpec] = useState('')
  const [formSupplierNotes, setFormSupplierNotes] = useState('')

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/items${showInactive ? '?includeInactive=1' : ''}`)
      if (res.ok) setItems(await res.json())
    } catch {
      toast.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  // 載入待生效的預約改價（GET 已按 pending→effectiveDate 排序，同品項取最早一筆）
  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/price-schedule?status=pending')
      if (!res.ok) return
      const rows = (await res.json()) as Array<{
        itemId: number
        newCostPrice: number | null
        newStorePrice: number | null
        effectiveDate: string
      }>
      const map = new Map<number, PendingSchedule>()
      for (const r of rows) {
        if (!map.has(r.itemId)) {
          map.set(r.itemId, {
            effectiveDate: r.effectiveDate,
            newCostPrice: r.newCostPrice,
            newStorePrice: r.newStorePrice,
          })
        }
      }
      setPendingByItem(map)
    } catch {
      /* 預約改價提示是輔助資訊，載入失敗不阻斷品項編輯 */
    }
  }, [])

  useEffect(() => {
    fetchItems()
    fetchPending()
  }, [fetchItems, fetchPending])

  // 從實際品項動態產生分類列表
  const categories = useMemo(() => {
    const cats = [...new Set(items.map((i) => i.category))].sort()
    return ['全部', ...cats]
  }, [items])

  // 供應商列表（去重）
  const supplierNames = useMemo(() => {
    const names = [...new Set(items.map((i) => i.supplierName))].sort()
    return ['全部', ...names]
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch = !search || item.name.includes(search) || item.supplierName.includes(search)
      const matchCategory = categoryFilter === '全部' || item.category === categoryFilter
      const matchSupplier = supplierFilter === '全部' || item.supplierName === supplierFilter
      return matchSearch && matchCategory && matchSupplier
    })
  }, [items, search, categoryFilter, supplierFilter])

  function openAdd() {
    setEditTarget(null)
    setFormName(''); setFormCategory(''); setFormUnit('份')
    setFormCostPrice(0); setFormStorePrice(0); setFormMarkupPct(20)
    setFormSpec(''); setFormSupplierNotes('')
    setDialogOpen(true)
  }

  function openEdit(item: ItemData) {
    setEditTarget(item)
    setFormName(item.name)
    setFormCategory(item.category)
    setFormUnit(item.unit)
    setFormCostPrice(item.costPrice)
    // 用原始手動固定價（rawStorePrice），不是算過的有效價
    setFormStorePrice(item.rawStorePrice ?? 0)
    setFormMarkupPct(item.storeMarkupPct ?? 20)
    setFormSpec(item.spec || '')
    setFormSupplierNotes(item.supplierNotes || '')
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!formName.trim()) { toast.error('品項名稱不能為空'); return }
    setSubmitting(true)
    try {
      if (editTarget) {
        // 編輯：PATCH /api/items/[id] — 目前用通用的方式
        // 這裡先用簡單的 body，之後可以擴充
        const res = await fetch(`/api/items/${editTarget.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            category: formCategory,
            unit: formUnit,
            costPrice: formCostPrice,
            storePrice: formStorePrice,
            storeMarkupPct: formMarkupPct,
            spec: formSpec || null,
            supplierNotes: formSupplierNotes || null,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          toast.error(data.error || '更新失敗')
          return
        }
        toast.success(`已更新 ${formName}`)
      }
      setDialogOpen(false)
      fetchItems()
    } catch {
      toast.error('操作失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // 下架（軟刪除）/ 重新上架 — 保留歷史，可逆
  async function handleToggleActive(item: ItemData) {
    setActingId(item.id)
    try {
      if (item.isActive) {
        const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
        if (!res.ok) { toast.error('下架失敗'); return }
        toast.success(`已下架 ${item.name}`)
      } else {
        const res = await fetch(`/api/items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: true }),
        })
        if (!res.ok) { toast.error('上架失敗'); return }
        toast.success(`已重新上架 ${item.name}`)
      }
      fetchItems()
    } catch {
      toast.error('操作失敗')
    } finally {
      setActingId(null)
    }
  }

  // 真刪除（硬刪）— 只在該品項完全沒被引用時成功；有關聯回 409，引導改用下架
  async function handleHardDelete() {
    if (!deleteTarget) return
    const item = deleteTarget
    setActingId(item.id)
    try {
      const res = await fetch(`/api/items/${item.id}?hard=1`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || '刪除失敗')
        return
      }
      toast.success(`已永久刪除 ${item.name}`)
      setDeleteTarget(null)
      fetchItems()
    } catch {
      toast.error('操作失敗')
    } finally {
      setActingId(null)
    }
  }

  // 批次範圍內「有手動固定價」的品項數（不清除的話這些不受加成影響）
  const batchManualCount = useMemo(() => {
    return items.filter(
      (i) => (batchCategory === '全部' || i.category === batchCategory) && (i.rawStorePrice ?? 0) > 0
    ).length
  }, [items, batchCategory])

  const batchScopeCount = useMemo(() => {
    return items.filter((i) => batchCategory === '全部' || i.category === batchCategory).length
  }, [items, batchCategory])

  async function handleBatchApply() {
    setBatchSubmitting(true)
    try {
      const res = await fetch('/api/items/batch-markup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: batchCategory,
          markupPct: batchPct,
          clearManual: batchClearManual,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || '批次設定失敗')
        return
      }
      const data = await res.json()
      const catLabel = batchCategory === '全部' ? '全部品項' : batchCategory
      let msg = `已將「${catLabel}」${data.updated} 項設為加成 ${batchPct}%`
      if (data.manualKept > 0) msg += `（${data.manualKept} 項有手動固定價，不受影響）`
      toast.success(msg)
      setBatchOpen(false)
      fetchItems()
    } finally {
      setBatchSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <SkeletonTable rows={8} cols={6} />
      </div>
    )
  }

  // 空狀態文案：有篩選條件 → 引導清條件；本來就沒品項 → 引導去哪裡新增
  const hasFilters = search !== '' || categoryFilter !== '全部' || supplierFilter !== '全部'
  const emptyNode = hasFilters ? (
    <EmptyState
      icon={SearchX}
      title="沒有符合的品項"
      description="換個關鍵字，或把分類 / 供應商篩選切回「全部」再找找看。"
      action={
        <Button
          variant="outline"
          onClick={() => { setSearch(''); setCategoryFilter('全部'); setSupplierFilter('全部') }}
        >
          清除篩選條件
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={PackageSearch}
      title={showInactive ? '還沒有任何品項' : '沒有上架中的品項'}
      description={
        showInactive
          ? '品項是跟著供應商建立的，到「供應商」頁面挑一家廠商就能新增它的品項。'
          : '可能全部都被下架了。點右上角的「顯示已下架」切換檢視，或到「供應商」頁面新增品項。'
      }
    />
  )

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 標題 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">品項管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">共 {items.length} 個品項</p>
        </div>
        <Button variant="outline" className="gap-1.5 shrink-0" onClick={() => setBatchOpen(true)}>
          <Percent className="size-4" /> 批次設加成
        </Button>
      </div>

      {/* 搜尋 + 分類篩選 */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="搜尋品項或供應商..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? '全部')}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="分類" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={(v) => setSupplierFilter(v ?? '全部')}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="供應商" />
          </SelectTrigger>
          <SelectContent>
            {supplierNames.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 顯示已下架切換：打開才看得到已下架品項，並能「重新上架」或「永久刪除」 */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
            showInactive
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background text-muted-foreground border-border hover:bg-accent'
          }`}
        >
          {showInactive ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          {showInactive ? '顯示已下架' : '只看上架中'}
        </button>
      </div>

      {/* 品項列表 */}
      <Card>
        <CardContent className="pt-0 px-0">
          {/* 桌面版 */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">品號</TableHead>
                  <TableHead>品項</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>供應商</TableHead>
                  <TableHead className="text-right">進貨價</TableHead>
                  <TableHead className="text-right">店家採購價</TableHead>
                  <TableHead className="text-center">單位</TableHead>
                  <TableHead className="pr-4 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="p-0">
                      {emptyNode}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const catStyle = CATEGORY_COLORS[item.category] ?? 'bg-muted text-muted-foreground'
                    return (
                      <TableRow key={item.id} className={`hover:bg-muted/30 ${!item.isActive ? 'opacity-55' : ''}`}>
                        <TableCell className="pl-4 text-xs text-muted-foreground font-mono tabular-nums">{item.sku || '-'}</TableCell>
                        <TableCell className="font-medium">
                          {item.name}
                          {!item.isActive && (
                            <span className="ml-1.5 inline-flex h-4 items-center rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">已下架</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${catStyle}`}>
                            {item.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.supplierName}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {item.costPrice > 0 ? formatCurrency(item.costPrice) : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {item.storePrice > 0 ? formatCurrency(item.storePrice) : '-'}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="pr-4 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="編輯">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={item.isActive
                              ? 'text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300'
                              : 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300'}
                            disabled={actingId === item.id}
                            onClick={() => handleToggleActive(item)}
                            title={item.isActive ? '下架（不出現在叫貨清單，保留歷史，可再上架）' : '重新上架'}
                          >
                            {item.isActive ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            disabled={actingId === item.id}
                            onClick={() => setDeleteTarget(item)}
                            title="永久刪除（僅限從未被叫貨/引用的品項）"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* 手機版 */}
          <div className="md:hidden divide-y">
            {filteredItems.length === 0 && emptyNode}
            {filteredItems.map((item) => {
              const catStyle = CATEGORY_COLORS[item.category] ?? 'bg-muted text-muted-foreground'
              return (
                <div key={item.id} className={`px-3 py-3 space-y-1.5 ${!item.isActive ? 'opacity-55' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate">{item.name}</span>
                      <span className={`inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-medium shrink-0 ${catStyle}`}>
                        {item.category}
                      </span>
                      {!item.isActive && (
                        <span className="inline-flex h-4 items-center rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground shrink-0">已下架</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)} title="編輯">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`size-8 ${item.isActive ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}
                        disabled={actingId === item.id}
                        onClick={() => handleToggleActive(item)}
                        title={item.isActive ? '下架' : '重新上架'}
                      >
                        {item.isActive ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        disabled={actingId === item.id}
                        onClick={() => setDeleteTarget(item)}
                        title="永久刪除"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted-foreground">
                    <span className="truncate">{item.supplierName}</span>
                    <span>/{item.unit}</span>
                    {item.costPrice > 0 && (
                      <span className="tabular-nums">進 {formatCurrency(item.costPrice)}</span>
                    )}
                    {item.storePrice > 0 && (
                      <span className="tabular-nums font-medium text-foreground">
                        店 {formatCurrency(item.storePrice)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 編輯 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? `編輯 ${editTarget.name}` : '新增品項'}</DialogTitle>
          </DialogHeader>
          {/* 🟡9d 預約改價 vs 手動改價衝突提醒：此品項有待生效排程時，手動改價會在生效日被覆蓋 */}
          {(() => {
            const sched = editTarget ? pendingByItem.get(editTarget.id) : undefined
            if (!sched) return null
            return (
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                <div className="flex items-start gap-2">
                  <CalendarClock className="size-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-medium">此品項有預約改價（{sched.effectiveDate} 生效）</p>
                    <p className="text-xs">
                      屆時進貨價將改為{' '}
                      <span className="font-semibold tabular-nums">
                        {sched.newCostPrice != null ? formatCurrency(sched.newCostPrice) : '—'}
                      </span>
                      {sched.newStorePrice != null && sched.newStorePrice > 0 && (
                        <>、店家採購價改為 <span className="font-semibold tabular-nums">{formatCurrency(sched.newStorePrice)}</span></>
                      )}
                      。現在手動改價會在生效日被排程覆蓋，如要永久調整請一併到「預約改價」修改或取消該排程。
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>品項名稱</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例：台灣豬五花" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>分類</Label>
                <Select value={formCategory} onValueChange={(v) => setFormCategory(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="選擇分類" /></SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c !== '全部').map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>單位</Label>
                <Input value={formUnit} onChange={(e) => setFormUnit(e.target.value)} placeholder="斤/份/包" />
              </div>
            </div>

            {/* 進貨價 + 加成 %（採購用，不含售價） */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>進貨價 ($)</Label>
                <Input type="number" min={0} value={formCostPrice} onChange={(e) => setFormCostPrice(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>店家加成 (%)</Label>
                <Input type="number" min={0} step="1" value={formMarkupPct} onChange={(e) => setFormMarkupPct(Number(e.target.value))} placeholder="例：20" />
              </div>
            </div>

            {/* 自動算出的店家採購價（加成模式） */}
            {formStorePrice === 0 && formCostPrice > 0 && (
              <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
                店家採購價（自動）＝ 進貨價{' '}
                <span className="tabular-nums">{formatCurrency(formCostPrice)}</span> × (1 +{' '}
                <span className="tabular-nums">{formMarkupPct}</span>%) ={' '}
                <span className="font-semibold text-primary tabular-nums">
                  {formatCurrency(Math.round(formCostPrice * (1 + formMarkupPct / 100)))}
                </span>
              </div>
            )}

            {/* 手動固定價（選填，填了就蓋過加成 %） */}
            <div className="space-y-1.5">
              <Label>
                店家採購價 — 手動固定 ($)
                <span className="text-xs text-muted-foreground font-normal ml-1">（選填，填了就蓋過上面的加成）</span>
              </Label>
              <Input type="number" min={0} value={formStorePrice} onChange={(e) => setFormStorePrice(Number(e.target.value))} placeholder="0 = 用加成 % 自動算" />
            </div>

            {/* 備註 */}
            <div className="space-y-1.5">
              <Label>內部備註 <span className="text-xs text-muted-foreground font-normal">（出餐規格、損耗等，內部人員看）</span></Label>
              <Input value={formSpec} onChange={(e) => setFormSpec(e.target.value)} placeholder="例：120g/份" />
            </div>
            <div className="space-y-1.5">
              <Label>叫貨備註 <span className="text-xs text-muted-foreground font-normal">（給供應商看，會印在叫貨單上）</span></Label>
              <Input value={formSupplierNotes} onChange={(e) => setFormSupplierNotes(e.target.value)} placeholder="例：請切24cm以內" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '儲存中...' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批次設加成 % Dialog */}
      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>批次設定店家加成 %</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              把整個分類的品項一次改成同一個加成 %，省得一項項改。
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>套用分類</Label>
                <Select value={batchCategory} onValueChange={(v) => setBatchCategory(v ?? '全部')}>
                  <SelectTrigger><SelectValue placeholder="分類" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>加成 (%)</Label>
                <Input type="number" min={0} step="1" value={batchPct} onChange={(e) => setBatchPct(Number(e.target.value))} />
              </div>
            </div>

            <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
              將套用到 <span className="font-semibold text-primary tabular-nums">{batchScopeCount}</span> 個品項
              {batchCategory === '全部' ? '（全部）' : `（${batchCategory}）`}
            </div>

            {/* 有手動固定價的提醒 + 清除選項 */}
            {batchManualCount > 0 && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm cursor-pointer dark:border-amber-500/30 dark:bg-amber-500/15">
                <input
                  type="checkbox"
                  checked={batchClearManual}
                  onChange={(e) => setBatchClearManual(e.target.checked)}
                  className="size-4 accent-primary mt-0.5 shrink-0"
                />
                <span className="text-amber-800 dark:text-amber-300">
                  這範圍有 <strong>{batchManualCount}</strong> 項設了「手動固定價」，
                  預設<strong>不會</strong>被加成影響。
                  <br />勾此項＝連手動固定價一起清掉，讓全部改吃 {batchPct}% 加成。
                </span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={batchSubmitting}>取消</Button>
            <Button onClick={handleBatchApply} disabled={batchSubmitting}>
              {batchSubmitting ? '套用中...' : '套用'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 永久刪除確認 Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>永久刪除品項？</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1 text-sm">
            <p>
              即將永久刪除「<span className="font-semibold">{deleteTarget?.name}</span>」，此動作無法復原。
            </p>
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-xs dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300">
              只有從未被叫貨、庫存、配方、價格排程等引用的品項才能真刪除；若已有關聯資料會被擋下，請改用「下架」。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={actingId === deleteTarget?.id}
              onClick={handleHardDelete}
            >
              {actingId === deleteTarget?.id ? '刪除中...' : '確定永久刪除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
