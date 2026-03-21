'use client'

/**
 * 品項管理頁面
 * 功能：
 *  1. 品項列表（搜尋 + 分類篩選）
 *  2. 毛利率顏色標示（>70% 綠、50-70% 黃、<50% 紅）
 *  3. 新增/編輯 Dialog
 */

import { useState, useMemo } from 'react'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ── 型別與常數 ────────────────────────────────────────────────────────────────

interface MenuItem {
  id: number
  name: string
  category: string
  supplier: string
  cost: number
  price: number
  unit: string
}

/** 分類選項 */
const CATEGORIES = ['全部', '肉品', '海鮮', '蔬菜', '火鍋料', '飲料', '底料', '內臟', '其他']

/** 分類顏色 */
const CATEGORY_COLORS: Record<string, string> = {
  肉品: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  海鮮: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  蔬菜: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  火鍋料: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  飲料: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  底料: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  內臟: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
}

// ── Mock 資料 ─────────────────────────────────────────────────────────────────

const MOCK_MENU_ITEMS: MenuItem[] = [
  { id: 1, name: '台灣豬五花', category: '肉品', supplier: '以曜', cost: 150, price: 280, unit: '斤' },
  { id: 2, name: 'CH霜降牛', category: '肉品', supplier: '以曜', cost: 365, price: 680, unit: '斤' },
  { id: 3, name: '美國特選肋眼', category: '肉品', supplier: '美福', cost: 480, price: 880, unit: '斤' },
  { id: 4, name: '白蝦(40/50)', category: '海鮮', supplier: '瑞濱海鮮', cost: 305, price: 580, unit: '包' },
  { id: 5, name: '高麗菜', category: '蔬菜', supplier: '幕府', cost: 18, price: 35, unit: '把' },
  { id: 6, name: '鴨血', category: '火鍋料', supplier: '韓流', cost: 25, price: 55, unit: '份' },
  { id: 7, name: '魚板', category: '火鍋料', supplier: '韓流', cost: 38, price: 75, unit: '份' },
  { id: 8, name: '台灣啤酒', category: '飲料', supplier: '鉊玖', cost: 47, price: 80, unit: '瓶' },
  { id: 9, name: '牛肉湯底', category: '底料', supplier: '繼光/大陸', cost: 120, price: 180, unit: '份' },
  { id: 10, name: '豬腸', category: '內臟', supplier: '市場直購', cost: 80, price: 130, unit: '份' },
]

// ── 輔助函式 ──────────────────────────────────────────────────────────────────

/**
 * 計算毛利率（%）
 * 公式：(售價 - 成本) / 售價 * 100
 */
function calcMargin(cost: number, price: number): number {
  if (price <= 0) return 0
  return Math.round(((price - cost) / price) * 100)
}

/**
 * 毛利率顏色 CSS class
 * CRITICAL: 閾值規則：>70% 綠色（健康），50-70% 黃色（注意），<50% 紅色（警示）
 */
function marginColorClass(margin: number): string {
  if (margin > 70) return 'text-green-600 dark:text-green-400'
  if (margin >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

// ── 品項表單 Dialog ───────────────────────────────────────────────────────────

type MenuItemFormData = Omit<MenuItem, 'id'>

const EMPTY_FORM: MenuItemFormData = {
  name: '',
  category: '',
  supplier: '',
  cost: 0,
  price: 0,
  unit: '份',
}

interface MenuItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTarget: MenuItem | null
  onSubmit: (data: MenuItemFormData) => void
}

function MenuItemDialog({ open, onOpenChange, editTarget, onSubmit }: MenuItemDialogProps) {
  const [form, setForm] = useState<MenuItemFormData>(
    editTarget
      ? {
          name: editTarget.name,
          category: editTarget.category,
          supplier: editTarget.supplier,
          cost: editTarget.cost,
          price: editTarget.price,
          unit: editTarget.unit,
        }
      : EMPTY_FORM
  )

  function set<K extends keyof MenuItemFormData>(field: K, value: MenuItemFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      alert('品項名稱不能為空')
      return
    }
    onSubmit(form)
    onOpenChange(false)
    setForm(EMPTY_FORM)
  }

  const previewMargin = calcMargin(form.cost, form.price)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editTarget ? '編輯品項' : '新增品項'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 品項名稱 */}
          <div className="space-y-1.5">
            <Label htmlFor="item-name">品項名稱 *</Label>
            <Input
              id="item-name"
              placeholder="例：台灣豬五花"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          {/* 分類 */}
          <div className="space-y-1.5">
            <Label>分類</Label>
            <Select value={form.category} onValueChange={(v) => set('category', v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="選擇分類" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.filter((c) => c !== '全部').map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 供應商 */}
          <div className="space-y-1.5">
            <Label htmlFor="item-supplier">供應商</Label>
            <Input
              id="item-supplier"
              placeholder="例：以曜"
              value={form.supplier}
              onChange={(e) => set('supplier', e.target.value)}
            />
          </div>

          {/* 成本 & 售價（並排） */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-cost">進貨成本 ($)</Label>
              <Input
                id="item-cost"
                type="number"
                min={0}
                value={form.cost}
                onChange={(e) => set('cost', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-price">售價 ($)</Label>
              <Input
                id="item-price"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => set('price', Number(e.target.value))}
              />
            </div>
          </div>

          {/* 毛利率即時預覽 */}
          {form.price > 0 && (
            <p className="text-sm">
              毛利率：
              <span className={`font-semibold ${marginColorClass(previewMargin)}`}>
                {previewMargin}%
              </span>
            </p>
          )}

          {/* 單位 */}
          <div className="space-y-1.5">
            <Label htmlFor="item-unit">單位</Label>
            <Input
              id="item-unit"
              placeholder="例：斤、份、包"
              value={form.unit}
              onChange={(e) => set('unit', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button onClick={handleSubmit}>
            {editTarget ? '儲存變更' : '新增'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>(MOCK_MENU_ITEMS)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null)

  /** 篩選後的品項列表 */
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        search === '' ||
        item.name.includes(search) ||
        item.supplier.includes(search)
      const matchCategory =
        categoryFilter === '全部' || item.category === categoryFilter
      return matchSearch && matchCategory
    })
  }, [items, search, categoryFilter])

  /** 開啟新增 Dialog */
  function handleAddNew() {
    setEditTarget(null)
    setDialogOpen(true)
  }

  /** 開啟編輯 Dialog */
  function handleEdit(item: MenuItem) {
    setEditTarget(item)
    setDialogOpen(true)
  }

  /** 刪除品項 */
  function handleDelete(id: number) {
    if (!confirm('確定要刪除這個品項嗎？')) return
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  /** 新增/儲存品項 */
  function handleSubmit(data: MenuItemFormData) {
    if (editTarget) {
      setItems((prev) =>
        prev.map((i) => (i.id === editTarget.id ? { ...i, ...data } : i))
      )
    } else {
      const newId = Math.max(...items.map((i) => i.id), 0) + 1
      setItems((prev) => [...prev, { id: newId, ...data }])
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 頁面標題 + 新增按鈕 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">品項管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">共 {items.length} 個品項</p>
        </div>
        <Button className="gap-1.5" onClick={handleAddNew}>
          <Plus className="size-4" />
          新增品項
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
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 品項列表卡片（含 Table） */}
      <Card>
        <CardContent className="pt-0 px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">品項</TableHead>
                <TableHead>分類</TableHead>
                <TableHead>供應商</TableHead>
                <TableHead className="text-right">成本</TableHead>
                <TableHead className="text-right">售價</TableHead>
                <TableHead className="text-right">毛利率</TableHead>
                <TableHead className="text-center">單位</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    沒有符合的品項
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const margin = calcMargin(item.cost, item.price)
                  const catStyle = CATEGORY_COLORS[item.category] ?? 'bg-muted text-muted-foreground'
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium pl-4">{item.name}</TableCell>
                      <TableCell>
                        <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${catStyle}`}>
                          {item.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.supplier}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ${item.cost.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ${item.price.toLocaleString()}
                      </TableCell>
                      {/* CRITICAL: 毛利率顏色標示，>70% 綠，50-70% 黃，<50% 紅 */}
                      <TableCell className="text-right">
                        <span className={`font-semibold ${marginColorClass(margin)}`}>
                          {margin}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">{item.unit}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(item)}
                            title="編輯"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(item.id)}
                            title="刪除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 新增/編輯 Dialog */}
      <MenuItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
