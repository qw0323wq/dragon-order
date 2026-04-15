'use client'

/**
 * 品項管理頁面（接真實 API）
 * 功能：品項列表（搜尋 + 分類篩選）、進貨價 + 店家採購價 + 售價 + 毛利率
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Plus, Search, Pencil } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  storePrice: number      // 有效店家採購價（API 已計算）
  sellPrice: number
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
  肉品: 'bg-red-100 text-red-700',
  海鮮: 'bg-blue-100 text-blue-700',
  蔬菜: 'bg-green-100 text-green-700',
  菇類: 'bg-emerald-100 text-emerald-700',
  豆製品: 'bg-amber-100 text-amber-700',
  火鍋料: 'bg-orange-100 text-orange-700',
  特色: 'bg-rose-100 text-rose-700',
  內臟: 'bg-pink-100 text-pink-700',
  滷煮: 'bg-stone-100 text-stone-700',
  底料: 'bg-yellow-100 text-yellow-700',
  飲料: 'bg-purple-100 text-purple-700',
  酒類: 'bg-indigo-100 text-indigo-700',
  甜點: 'bg-fuchsia-100 text-fuchsia-700',
  雜貨: 'bg-gray-100 text-gray-700',
  耗材: 'bg-slate-100 text-slate-700',
}

// ── 輔助函式 ──

function calcMargin(cost: number, price: number): number {
  if (price <= 0 || cost <= 0) return 0
  return Math.round(((price - cost) / price) * 100)
}

function marginColorClass(margin: number): string {
  if (margin > 70) return 'text-green-600'
  if (margin >= 50) return 'text-yellow-600'
  return 'text-red-600'
}

// ── 頁面 ──

export default function MenuPage() {
  const [items, setItems] = useState<ItemData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [supplierFilter, setSupplierFilter] = useState('全部')

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ItemData | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 表單
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formUnit, setFormUnit] = useState('份')
  const [formCostPrice, setFormCostPrice] = useState(0)
  const [formStorePrice, setFormStorePrice] = useState(0)
  const [formSellPrice, setFormSellPrice] = useState(0)
  const [formSpec, setFormSpec] = useState('')
  const [formSupplierNotes, setFormSupplierNotes] = useState('')

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/items')
      if (res.ok) setItems(await res.json())
    } catch {
      toast.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

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
    setFormCostPrice(0); setFormStorePrice(0); setFormSellPrice(0)
    setFormSpec(''); setFormSupplierNotes('')
    setDialogOpen(true)
  }

  function openEdit(item: ItemData) {
    setEditTarget(item)
    setFormName(item.name)
    setFormCategory(item.category)
    setFormUnit(item.unit)
    setFormCostPrice(item.costPrice)
    setFormStorePrice(item.storePrice)
    setFormSellPrice(item.sellPrice)
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
            sellPrice: formSellPrice,
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

  const previewMargin = calcMargin(formCostPrice, formSellPrice)
  const previewStoreMargin = calcMargin(formStorePrice, formSellPrice)

  if (loading) {
    return <div className="p-4 md:p-6"><p className="text-muted-foreground">載入中...</p></div>
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 標題 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">品項管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">共 {items.length} 個品項</p>
        </div>
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

      {/* 品項列表 */}
      <Card>
        <CardContent className="pt-0 px-0">
          {/* 桌面版 */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">品號</TableHead>
                  <TableHead>品項</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>供應商</TableHead>
                  <TableHead className="text-right">進貨價</TableHead>
                  <TableHead className="text-right">店家採購價</TableHead>
                  <TableHead className="text-right">售價</TableHead>
                  <TableHead className="text-right">毛利率</TableHead>
                  <TableHead className="text-center">單位</TableHead>
                  <TableHead className="pr-4 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      沒有符合的品項
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const margin = calcMargin(item.costPrice, item.sellPrice)
                    const catStyle = CATEGORY_COLORS[item.category] ?? 'bg-muted text-muted-foreground'
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="pl-4 text-xs text-muted-foreground font-mono">{item.sku || '-'}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${catStyle}`}>
                            {item.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.supplierName}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.costPrice > 0 ? formatCurrency(item.costPrice) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.storePrice > 0 ? formatCurrency(item.storePrice) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.sellPrice > 0 ? formatCurrency(item.sellPrice) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {margin > 0 ? (
                            <span className={`font-semibold ${marginColorClass(margin)}`}>{margin}%</span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="pr-4 text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="編輯">
                            <Pencil className="size-3.5" />
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
            {filteredItems.map((item) => {
              const margin = calcMargin(item.costPrice, item.sellPrice)
              const catStyle = CATEGORY_COLORS[item.category] ?? 'bg-muted text-muted-foreground'
              return (
                <div key={item.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.name}</span>
                      <span className={`inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-medium ${catStyle}`}>
                        {item.category}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Pencil className="size-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{item.supplierName}</span>
                    <span>/{item.unit}</span>
                    {item.costPrice > 0 && <span>進${item.costPrice}</span>}
                    {item.storePrice > 0 && <span>店${item.storePrice}</span>}
                    {item.sellPrice > 0 && <span>售${item.sellPrice}</span>}
                    {margin > 0 && (
                      <span className={`font-semibold ${marginColorClass(margin)}`}>{margin}%</span>
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

            {/* 三種價格 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>進貨價 ($)</Label>
                <Input type="number" min={0} value={formCostPrice} onChange={(e) => setFormCostPrice(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>店家採購價 ($)</Label>
                <Input type="number" min={0} value={formStorePrice} onChange={(e) => setFormStorePrice(Number(e.target.value))} placeholder="0=自動加成" />
              </div>
              <div className="space-y-1.5">
                <Label>售價 ($)</Label>
                <Input type="number" min={0} value={formSellPrice} onChange={(e) => setFormSellPrice(Number(e.target.value))} />
              </div>
            </div>

            {/* 毛利率預覽 */}
            {formSellPrice > 0 && (
              <div className="text-sm space-y-0.5">
                {formCostPrice > 0 && (
                  <p>
                    總公司毛利（進貨→售價）：
                    <span className={`font-semibold ${marginColorClass(previewMargin)}`}>{previewMargin}%</span>
                  </p>
                )}
                {formStorePrice > 0 && (
                  <p>
                    分店毛利（店家採購→售價）：
                    <span className={`font-semibold ${marginColorClass(previewStoreMargin)}`}>{previewStoreMargin}%</span>
                  </p>
                )}
              </div>
            )}

            {formStorePrice === 0 && formCostPrice > 0 && (
              <p className="text-xs text-muted-foreground">
                店家採購價 = 0 時自動使用進貨價 × 1.2 = ${Math.round(formCostPrice * 1.2)}
              </p>
            )}

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
    </div>
  )
}
