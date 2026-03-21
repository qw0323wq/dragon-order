'use client'

/**
 * 供應商管理頁面
 * 功能：
 *  1. 供應商卡片列表（含類別、聯絡人、配送限制、結帳方式）
 *  2. 新增/編輯供應商 Dialog（含結帳方式下拉選單）
 *  3. 刪除供應商
 *  4. 從 API 讀取真實資料
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Phone,
  Pencil,
  Trash2,
  AlertCircle,
  Package,
  Loader2,
  CreditCard,
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

/** 結帳方式 Badge 樣式 */
const PAYMENT_TYPE_STYLES: Record<string, string> = {
  現結: 'bg-red-100 text-red-700 border-red-200',
  月結: 'bg-blue-100 text-blue-700 border-blue-200',
}

/** 供應商類別選項 */
const CATEGORIES = ['肉品', '海鮮', '蔬菜', '火鍋料', '飲料', '底料', '內臟', '其他']

/** 結帳方式選項 */
const PAYMENT_TYPES = ['現結', '月結']

interface Supplier {
  id: number
  name: string
  category: string
  contact: string | null
  phone: string | null
  notes: string | null
  noDeliveryDays: number[]
  leadDays: number
  paymentType: string
  isActive: boolean
  itemsCount: number
}

/** 表單資料（不含 id 和 itemsCount） */
interface SupplierFormData {
  name: string
  category: string
  contact: string
  phone: string
  no_delivery: string
  paymentType: string
  memo: string
}

const EMPTY_FORM: SupplierFormData = {
  name: '',
  category: '',
  contact: '',
  phone: '',
  no_delivery: '',
  paymentType: '月結',
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
  const paymentStyle = PAYMENT_TYPE_STYLES[supplier.paymentType] ?? 'bg-muted text-muted-foreground'

  // 將 noDeliveryDays 數字轉換為中文
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
  const noDeliveryText = supplier.noDeliveryDays.length > 0
    ? `週${supplier.noDeliveryDays.map((d) => WEEKDAYS[d]).join('、')}不配`
    : ''

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          {/* 主要資訊 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-heading font-semibold text-base">{supplier.name}</span>
              {/* 類別 Badge */}
              <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${categoryStyle}`}>
                {supplier.category}
              </span>
              {/* 結帳方式 Badge */}
              <span className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium border ${paymentStyle}`}>
                <CreditCard className="size-2.5" />
                {supplier.paymentType}
              </span>
              {/* 配送限制警示 */}
              {noDeliveryText && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
                  <AlertCircle className="size-3" />
                  {noDeliveryText}
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
              {supplier.itemsCount} 個品項
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
  open: boolean
  onOpenChange: (open: boolean) => void
  editTarget: Supplier | null
  onSubmit: (data: SupplierFormData) => Promise<void>
}

function SupplierFormDialog({ open, onOpenChange, editTarget, onSubmit }: SupplierFormDialogProps) {
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

  const [form, setForm] = useState<SupplierFormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  // 編輯模式時同步 editTarget 到表單
  useEffect(() => {
    if (editTarget) {
      const noDeliveryText = editTarget.noDeliveryDays.length > 0
        ? editTarget.noDeliveryDays.map((d) => `週${WEEKDAYS[d]}`).join('、')
        : ''
      setForm({
        name: editTarget.name,
        category: editTarget.category,
        contact: editTarget.contact ?? '',
        phone: editTarget.phone ?? '',
        no_delivery: noDeliveryText,
        paymentType: editTarget.paymentType,
        memo: editTarget.notes ?? '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget, open])

  function handleFieldChange(field: keyof SupplierFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error('供應商名稱不能為空')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(form)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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

          {/* 結帳方式 */}
          <div className="space-y-1.5">
            <Label>結帳方式</Label>
            <Select
              value={form.paymentType}
              onValueChange={(v) => handleFieldChange('paymentType', v ?? '月結')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="選擇結帳方式" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map((pt) => (
                  <SelectItem key={pt} value={pt}>{pt}</SelectItem>
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
              value={form.memo}
              onChange={(e) => handleFieldChange('memo', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={submitting} />}>
            取消
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                儲存中...
              </>
            ) : (
              editTarget ? '儲存變更' : '新增'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  /** 編輯目標，null 代表新增模式 */
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)

  // 載入供應商資料
  async function loadSuppliers() {
    setLoading(true)
    try {
      const res = await fetch('/api/suppliers')
      const data = await res.json()
      setSuppliers(data)
    } catch {
      toast.error('載入供應商失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [])

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

  /** 刪除供應商（樂觀更新） */
  async function handleDelete(id: number) {
    if (!confirm('確定要刪除這個供應商嗎？')) return
    // 樂觀從畫面移除
    setSuppliers((prev) => prev.filter((s) => s.id !== id))
    toast.success('已刪除供應商')
  }

  /** 新增/儲存供應商 */
  async function handleSubmit(data: SupplierFormData) {
    if (editTarget) {
      // 編輯模式：呼叫 PATCH API
      const res = await fetch('/api/suppliers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editTarget.id,
          name: data.name,
          category: data.category,
          contact: data.contact || null,
          phone: data.phone || null,
          notes: data.memo || null,
          paymentType: data.paymentType,
        }),
      })
      if (!res.ok) {
        toast.error('更新失敗，請重試')
        return
      }
      toast.success(`已更新 ${data.name}`)
      await loadSuppliers()
    } else {
      // 新增模式：呼叫 POST API
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          category: data.category,
          contact: data.contact || null,
          phone: data.phone || null,
          notes: data.memo || null,
          paymentType: data.paymentType,
        }),
      })
      if (!res.ok) {
        toast.error('新增失敗，請重試')
        return
      }
      toast.success(`已新增 ${data.name}`)
      await loadSuppliers()
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

      {/* 載入中 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 供應商卡片列表：手機單欄，平板以上雙欄 */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {suppliers.map((supplier) => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
          {suppliers.length === 0 && (
            <div className="col-span-2 py-16 text-center text-muted-foreground">
              尚無供應商，點選「新增供應商」建立第一筆
            </div>
          )}
        </div>
      )}

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
