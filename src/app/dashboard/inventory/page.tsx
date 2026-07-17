'use client'

/**
 * 庫存管理頁
 * 功能：
 * 1. 地點切換（全部/總公司倉庫/林森/信義安和）
 * 2. 各品項目前庫存量 + 安全庫存警示
 * 3. 進貨/出貨/撥貨/盤點調整
 * 4. 分類篩選 + 搜尋
 * 5. 異動紀錄
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Search, Package, AlertTriangle, Plus, Minus, ClipboardCheck,
  Loader2, History, ArrowRightLeft, Boxes, WifiOff, SearchX,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
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

interface InventoryItem {
  id: number
  sku: string | null
  name: string
  category: string
  unit: string
  current_stock: number
  stock_unit: string | null
  safety_stock: number
  safety_stock_unit: string | null
  spec: string | null
  supplier_name: string
  isLow: boolean
}

interface LogEntry {
  id: number
  item_name: string
  type: string
  quantity: string
  unit: string | null
  balance_after: string
  store_name: string | null
  user_name: string | null
  source: string | null
  notes: string | null
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  in: '進貨',
  out: '出貨',
  adjust: '盤點',
  transfer: '撥貨',
  waste: '報廢',
  meal: '員工餐',
}

const TYPE_COLORS: Record<string, string> = {
  in: 'text-green-600 dark:text-green-400',
  out: 'text-red-600 dark:text-red-400',
  adjust: 'text-blue-600 dark:text-blue-400',
  waste: 'text-orange-600 dark:text-orange-400',
  meal: 'text-purple-600 dark:text-purple-400',
}

interface StoreOption {
  value: string
  label: string
}

const LOCATION_OPTIONS: StoreOption[] = [
  { value: 'all', label: '全部彙總' },
]

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [showLowOnly, setShowLowOnly] = useState(false)

  // 地點篩選
  const [location, setLocation] = useState('all')
  const [stores, setStores] = useState<StoreOption[]>([])

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<'in' | 'out' | 'adjust' | 'transfer'>('in')
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [formQty, setFormQty] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formSource, setFormSource] = useState('')
  const [formToStore, setFormToStore] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 異動紀錄
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsItem, setLogsItem] = useState<InventoryItem | null>(null)
  const [logsLoading, setLogsLoading] = useState(false)

  // 載入門市列表
  useEffect(() => {
    fetch('/api/stores').then(r => r.json()).then((data: { id: number; name: string }[]) => {
      setStores(data.map(s => ({ value: String(s.id), label: s.name })))
    }).catch(() => toast.error('載入資料失敗'))
  }, [])

  const [error, setError] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const storeParam = location === 'all' ? '' : `&store=${location}`
      const res = await fetch(`/api/inventory?_=${Date.now()}${storeParam}`)
      if (res.ok) setItems(await res.json())
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [location])

  useEffect(() => { fetchItems() }, [fetchItems])

  const categories = useMemo(() => {
    const cats = [...new Set(items.map(i => i.category))].sort()
    return ['全部', ...cats]
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(item => {
      const matchSearch = !search || item.name.includes(search) || item.supplier_name.includes(search)
      const matchCat = categoryFilter === '全部' || item.category === categoryFilter
      const matchLow = !showLowOnly || item.isLow
      return matchSearch && matchCat && matchLow
    })
  }, [items, search, categoryFilter, showLowOnly])

  const lowCount = items.filter(i => i.isLow).length
  // 顯示用：categories 第一筆是「全部」這個 UI 選項，不算真實分類
  const categoryCount = Math.max(categories.length - 1, 0)
  // 顯示用：有套用任何篩選時，空狀態要引導使用者清掉篩選
  const hasFilters = Boolean(search) || categoryFilter !== '全部' || showLowOnly

  // 開啟異動 Dialog
  function openAction(item: InventoryItem, type: 'in' | 'out' | 'adjust' | 'transfer') {
    setSelectedItem(item)
    setDialogType(type)
    setFormQty(type === 'adjust' ? String(item.current_stock) : '')
    setFormNotes('')
    setFormSource('')
    setFormToStore('')
    setDialogOpen(true)
  }

  // 當前操作的 storeId
  const currentStoreId = location === 'all' ? null : parseInt(location)
  // 「全部彙總」是跨店唯讀視圖，不能對單店做進出貨/撥貨/盤點（storeId 無意義會失敗）
  const canAct = location !== 'all'

  async function handleSubmit() {
    if (!selectedItem || !formQty) return
    if (dialogType === 'transfer' && !formToStore) {
      toast.error('請選擇撥貨目標')
      return
    }
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        itemId: selectedItem.id,
        type: dialogType,
        quantity: parseFloat(formQty),
        storeId: currentStoreId,
        source: formSource || undefined,
        notes: formNotes || undefined,
      }
      if (dialogType === 'transfer') {
        payload.toStoreId = parseInt(formToStore)
      }

      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`${selectedItem.name} ${TYPE_LABELS[dialogType]}完成`)
        setDialogOpen(false)
        fetchItems()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('操作失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // 查看異動紀錄
  async function viewLogs(item: InventoryItem) {
    setLogsItem(item)
    setLogsOpen(true)
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/inventory/logs?item_id=${item.id}`)
      if (res.ok) setLogs(await res.json())
    } catch {
      toast.error('載入紀錄失敗')
    } finally {
      setLogsLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">
            庫存管理
            {location !== 'all' && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {stores.find(s => s.value === location)?.label || ''}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {location === 'all' ? '全部門市彙總' : '單店庫存與異動'}
          </p>
        </div>
      </div>

      {/* 指標卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          label="品項總數"
          value={formatAmount(items.length)}
          icon={Package}
          accent="bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
          hint="個品項"
        />
        <StatCard
          label="低於安全庫存"
          value={formatAmount(lowCount)}
          icon={AlertTriangle}
          accent="bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
          hint={lowCount > 0 ? '需要補貨' : '庫存無虞'}
        />
        <StatCard
          label="品項分類"
          value={formatAmount(categoryCount)}
          icon={Boxes}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
          hint="個分類"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* 地點切換 */}
      <div className="flex flex-wrap gap-1.5">
        {[...LOCATION_OPTIONS, ...stores].map(opt => (
          <button
            key={opt.value}
            onClick={() => setLocation(opt.value)}
            className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              location === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 搜尋 + 篩選 */}
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
        <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v ?? '全部')}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="分類" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showLowOnly ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => setShowLowOnly(!showLowOnly)}
          className="gap-1.5"
        >
          <AlertTriangle className="size-3.5" />
          {showLowOnly ? '顯示全部' : `低庫存 (${lowCount})`}
        </Button>
      </div>

      {/* 庫存列表 */}
      {error ? (
        <EmptyState
          icon={WifiOff}
          title="載入庫存失敗"
          description="可能是網路不穩或伺服器忙碌，請稍候再試一次。"
          action={<Button variant="outline" size="sm" onClick={fetchItems}>重新載入</Button>}
        />
      ) : loading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 載入中...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="px-0 py-0">
            <EmptyState
              icon={hasFilters ? SearchX : Package}
              title={hasFilters ? '沒有符合的品項' : '這個地點還沒有庫存品項'}
              description={
                hasFilters
                  ? '換個關鍵字或分類試試，也可以直接清除目前的篩選條件。'
                  : '先到「品項管理」建立品項，回到這裡就能做進貨、盤點與撥貨。'
              }
              action={
                hasFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSearch(''); setCategoryFilter('全部'); setShowLowOnly(false) }}
                  >
                    清除篩選
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
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
                    <TableHead className="text-right">目前庫存</TableHead>
                    <TableHead className="text-right">安全庫存</TableHead>
                    <TableHead className="text-center">狀態</TableHead>
                    <TableHead className="text-right pr-4">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => (
                    <TableRow
                      key={item.id}
                      className={cn(
                        'transition-colors',
                        item.isLow
                          ? 'bg-red-50/50 hover:bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/15'
                          : 'hover:bg-muted/30',
                      )}
                    >
                      <TableCell className="pl-4 text-xs text-muted-foreground font-mono tabular-nums">{item.sku || '-'}</TableCell>
                      <TableCell className="font-medium">
                        {item.name}
                        {item.spec && (
                          <span className="text-xs text-muted-foreground ml-1">({item.spec.split('（')[0]})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.category}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{item.supplier_name}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums whitespace-nowrap">
                        <span className={cn('font-semibold', item.isLow && 'text-red-600 dark:text-red-400')}>
                          {item.current_stock}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          {item.stock_unit || item.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {item.safety_stock > 0 ? item.safety_stock : '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.isLow ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                            <AlertTriangle className="size-3" /> 不足
                          </span>
                        ) : item.current_stock > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
                            正常
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-0.5">
                          {canAct && (
                            <>
                              <Button variant="ghost" size="icon" title="進貨"
                                onClick={() => openAction(item, 'in')}
                                className="size-8 text-green-600 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-500/15 dark:hover:text-green-300">
                                <Plus className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" title="出貨"
                                onClick={() => openAction(item, 'out')}
                                className="size-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-300">
                                <Minus className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" title="盤點"
                                onClick={() => openAction(item, 'adjust')}
                                className="size-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-500/15 dark:hover:text-blue-300">
                                <ClipboardCheck className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" title="撥貨"
                                onClick={() => openAction(item, 'transfer')}
                                className="size-8 text-purple-600 hover:bg-purple-50 hover:text-purple-700 dark:text-purple-400 dark:hover:bg-purple-500/15 dark:hover:text-purple-300">
                                <ArrowRightLeft className="size-3.5" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" title="紀錄"
                            onClick={() => viewLogs(item)}
                            className="size-8">
                            <History className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* 手機版 */}
            <div className="md:hidden divide-y">
              {filtered.map(item => (
                <div
                  key={item.id}
                  className={cn(
                    'space-y-2 p-3 transition-colors',
                    item.isLow ? 'bg-red-50/50 dark:bg-red-500/10' : 'active:bg-muted/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {item.sku && <span className="font-mono text-[10px] tabular-nums text-muted-foreground mr-1">{item.sku}</span>}
                      <span className="font-medium text-sm">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">{item.category}</span>
                    </div>
                    {item.isLow && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-400">
                        <AlertTriangle className="size-3" /> 不足
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground tabular-nums">
                      庫存: <span className={cn('font-semibold', item.isLow ? 'text-red-600 dark:text-red-400' : 'text-foreground')}>
                        {item.current_stock}
                      </span> {item.stock_unit || item.unit}
                      {item.safety_stock > 0 && (
                        <span className="ml-2">安全: {item.safety_stock}</span>
                      )}
                    </div>
                    {canAct ? (
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openAction(item, 'in')} className="h-8 gap-1 px-2 text-green-600 dark:text-green-400">
                          <Plus className="size-3.5" /> 進
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openAction(item, 'out')} className="h-8 gap-1 px-2 text-red-600 dark:text-red-400">
                          <Minus className="size-3.5" /> 出
                        </Button>
                        <Button variant="ghost" size="icon" title="盤點" onClick={() => openAction(item, 'adjust')} className="size-8 text-blue-600 dark:text-blue-400">
                          <ClipboardCheck className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">選門市後可操作</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 進貨/出貨/盤點 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {selectedItem?.name} — {TYPE_LABELS[dialogType]}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground tabular-nums">
              目前庫存: <strong className="text-foreground">{selectedItem?.current_stock}</strong> {selectedItem?.stock_unit || selectedItem?.unit}
            </p>
            {dialogType === 'adjust' && formQty && selectedItem && parseFloat(formQty) !== selectedItem.current_stock && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                <ClipboardCheck className="mt-0.5 size-3.5 shrink-0" />
                <span className="tabular-nums">
                  {(() => {
                    const diff = parseFloat(formQty) - selectedItem.current_stock
                    return <>
                      將從 <strong>{selectedItem.current_stock}</strong> 調整為 <strong>{formQty}</strong>
                      （{diff > 0 ? `+${diff}` : diff}）
                    </>
                  })()}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{dialogType === 'adjust' ? '盤點後數量' : '數量'}</Label>
              <Input
                type="number"
                min={0}
                step="0.1"
                value={formQty}
                onChange={e => setFormQty(e.target.value)}
                placeholder={dialogType === 'adjust' ? '實際盤點數量' : '進/出數量'}
                autoFocus
              />
            </div>
            {dialogType === 'transfer' && (
              <div className="space-y-1.5">
                <Label>撥貨到</Label>
                <Select value={formToStore} onValueChange={v => setFormToStore(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="選擇目標地點" /></SelectTrigger>
                  <SelectContent>
                    {stores.filter(s => s.value !== location).map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>來源</Label>
              <Input
                value={formSource}
                onChange={e => setFormSource(e.target.value)}
                placeholder={dialogType === 'in' ? '如：以曜送貨' : dialogType === 'out' ? '如：林森店領用' : dialogType === 'transfer' ? '如：每週撥貨' : '如：月底盤點'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>備註</Label>
              <Textarea
                rows={2}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="選填..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting || !formQty}>
              {submitting ? '處理中...' : '確認'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 異動紀錄 Dialog */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{logsItem?.name} — 異動紀錄</DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="py-4 text-center text-muted-foreground">
              <Loader2 className="size-4 animate-spin mx-auto" />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={History}
              title="尚無異動紀錄"
              description="這個品項還沒有進貨、出貨或盤點紀錄，操作後就會顯示在這裡。"
              className="py-8"
            />
          ) : (
            <div className="divide-y text-sm">
              {logs.map(log => {
                const qty = parseFloat(log.quantity)
                return (
                  <div key={log.id} className="py-2 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('font-medium tabular-nums', TYPE_COLORS[log.type])}>
                        {TYPE_LABELS[log.type] || log.type}
                        {' '}
                        {qty > 0 ? '+' : ''}{qty} {log.unit || ''}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        餘 {log.balance_after}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('zh-TW')}
                      {log.store_name && <span className="ml-2">{log.store_name}</span>}
                      {log.user_name && <span className="ml-2">{log.user_name}</span>}
                      {log.source && <span className="ml-2">{log.source}</span>}
                    </div>
                    {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
