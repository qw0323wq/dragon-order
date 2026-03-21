'use client'

/**
 * 供應商管理頁面
 * 功能：
 *  1. 供應商卡片列表（含類別、聯絡人、配送限制）
 *  2. 新增供應商 Dialog
 *  3. 編輯 / 刪除（Mock，尚未串接 API）
 */

import { useState } from 'react'
import {
  Plus,
  Phone,
  Pencil,
  Trash2,
  AlertCircle,
  Package,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

/** 類別對應顏色 CSS class（Tailwind arbitrary 值） */
const CATEGORY_COLORS: Record<string, string> = {
  肉品: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  海鮮: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  蔬菜: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  火鍋料: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  飲料: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  底料: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  內臟: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
}

/** 供應商類別選項 */
const CATEGORIES = ['肉品', '海鮮', '蔬菜', '火鍋料', '飲料', '底料', '內臟', '其他']

interface Supplier {
  id: number
  name: string
  category: string
  contact: string
  phone: string
  items_count: number
  /** 配送限制說明，空字串代表無限制 */
  no_delivery: string
  memo?: string
}

// ── Mock 資料 ─────────────────────────────────────────────────────────────────

const MOCK_SUPPLIERS: Supplier[] = [
  { id: 1, name: '以曜', category: '肉品', contact: '', phone: '', items_count: 12, no_delivery: '' },
  { id: 2, name: '瑞濱海鮮', category: '海鮮', contact: '', phone: '', items_count: 8, no_delivery: '週日' },
  { id: 3, name: '幕府', category: '蔬菜', contact: '', phone: '', items_count: 10, no_delivery: '' },
  { id: 4, name: '韓流', category: '火鍋料', contact: '', phone: '', items_count: 15, no_delivery: '' },
  { id: 5, name: '鉊玖', category: '飲料', contact: '', phone: '', items_count: 8, no_delivery: '' },
  { id: 6, name: '美福', category: '肉品', contact: '', phone: '', items_count: 5, no_delivery: '' },
  { id: 7, name: '繼光/大陸', category: '底料', contact: '', phone: '', items_count: 6, no_delivery: '提前7-14天' },
  { id: 8, name: '市場直購', category: '內臟', contact: '', phone: '', items_count: 8, no_delivery: '每日採購' },
]

// ── 新增供應商表單預設值 ──────────────────────────────────────────────────────

const EMPTY_FORM: Omit<Supplier, 'id' | 'items_count'> = {
  name: '',
  category: '',
  contact: '',
  phone: '',
  no_delivery: '',
  memo: '',
}

// ── 供應商卡片元件 ────────────────────────────────────────────────────────────

interface SupplierCardProps {
  supplier: Supplier
  onEdit: (supplier: Supplier) => void
  onDelete: (id: number) => void
}

function SupplierCard({ supplier, onEdit, onDelete }: SupplierCardProps) {
  const categoryStyle = CATEGORY_COLORS[supplier.category] ?? 'bg-muted text-muted-foreground'

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          {/* 主要資訊 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-heading font-semibold text-base">{supplier.name}</span>
              {/* 類別 Badge：自訂顏色 */}
              <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${categoryStyle}`}>
                {supplier.category}
              </span>
              {/* 配送限制警示 */}
              {supplier.no_delivery && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
                  <AlertCircle className="size-3" />
                  {supplier.no_delivery}不配
                </span>
              )}
            </div>

            {/* 聯絡人 / 電話 */}
            <div className="mt-2 space-y-1">
              {supplier.contact ? (
                <p className="text-sm text-muted-foreground">{supplier.contact}</p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">聯絡人未填</p>
              )}
              {supplier.phone ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="size-3.5" />
                  {supplier.phone}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">電話未填</p>
              )}
            </div>

            {/* 品項數 */}
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Package className="size-3.5" />
              {supplier.items_count} 個品項
            </div>
          </div>

          {/* 操作按鈕 */}
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(supplier)}
              title="編輯"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(supplier.id)}
              title="刪除"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── 新增/編輯 Dialog 元件 ─────────────────────────────────────────────────────

interface SupplierFormDialogProps {
  /** open 由父層控制 */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 編輯模式時傳入，新增時為 null */
  editTarget: Supplier | null
  onSubmit: (data: Omit<Supplier, 'id' | 'items_count'>) => void
}

function SupplierFormDialog({ open, onOpenChange, editTarget, onSubmit }: SupplierFormDialogProps) {
  const [form, setForm] = useState<Omit<Supplier, 'id' | 'items_count'>>(
    editTarget
      ? {
          name: editTarget.name,
          category: editTarget.category,
          contact: editTarget.contact,
          phone: editTarget.phone,
          no_delivery: editTarget.no_delivery,
          memo: editTarget.memo ?? '',
        }
      : EMPTY_FORM
  )

  function handleFieldChange(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      alert('供應商名稱不能為空')
      return
    }
    onSubmit(form)
    onOpenChange(false)
    setForm(EMPTY_FORM)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editTarget ? '編輯供應商' : '新增供應商'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 名稱 */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-name">供應商名稱 *</Label>
            <Input
              id="sup-name"
              placeholder="例：以曜"
              value={form.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
            />
          </div>

          {/* 類別 */}
          <div className="space-y-1.5">
            <Label>類別</Label>
            <Select
              value={form.category}
              onValueChange={(v) => handleFieldChange('category', v ?? '')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="選擇類別" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 聯絡人 */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-contact">聯絡人</Label>
            <Input
              id="sup-contact"
              placeholder="業務姓名"
              value={form.contact}
              onChange={(e) => handleFieldChange('contact', e.target.value)}
            />
          </div>

          {/* 電話 */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-phone">電話</Label>
            <Input
              id="sup-phone"
              placeholder="0912-345-678"
              value={form.phone}
              onChange={(e) => handleFieldChange('phone', e.target.value)}
            />
          </div>

          {/* 配送限制 */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-no-delivery">配送限制</Label>
            <Input
              id="sup-no-delivery"
              placeholder="例：週日、提前7-14天"
              value={form.no_delivery}
              onChange={(e) => handleFieldChange('no_delivery', e.target.value)}
            />
          </div>

          {/* 備註 */}
          <div className="space-y-1.5">
            <Label htmlFor="sup-memo">備註</Label>
            <Textarea
              id="sup-memo"
              placeholder="其他說明..."
              rows={2}
              value={form.memo ?? ''}
              onChange={(e) => handleFieldChange('memo', e.target.value)}
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

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(MOCK_SUPPLIERS)
  const [dialogOpen, setDialogOpen] = useState(false)
  /** 編輯目標，null 代表新增模式 */
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)

  /** 開啟新增 Dialog */
  function handleAddNew() {
    setEditTarget(null)
    setDialogOpen(true)
  }

  /** 開啟編輯 Dialog */
  function handleEdit(supplier: Supplier) {
    setEditTarget(supplier)
    setDialogOpen(true)
  }

  /** 刪除供應商（Mock：直接從 state 移除） */
  function handleDelete(id: number) {
    if (!confirm('確定要刪除這個供應商嗎？')) return
    setSuppliers((prev) => prev.filter((s) => s.id !== id))
  }

  /** 新增/儲存供應商 */
  function handleSubmit(data: Omit<Supplier, 'id' | 'items_count'>) {
    if (editTarget) {
      // 編輯模式：更新既有供應商
      setSuppliers((prev) =>
        prev.map((s) => (s.id === editTarget.id ? { ...s, ...data } : s))
      )
    } else {
      // 新增模式：產生新 ID
      const newId = Math.max(...suppliers.map((s) => s.id), 0) + 1
      setSuppliers((prev) => [...prev, { id: newId, items_count: 0, ...data }])
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 頁面標題 + 新增按鈕 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">供應商管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">共 {suppliers.length} 家供應商</p>
        </div>
        <Button className="gap-1.5" onClick={handleAddNew}>
          <Plus className="size-4" />
          新增供應商
        </Button>
      </div>

      {/* 供應商卡片列表：手機單欄，平板以上雙欄 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {suppliers.map((supplier) => (
          <SupplierCard
            key={supplier.id}
            supplier={supplier}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* 新增/編輯 Dialog */}
      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
