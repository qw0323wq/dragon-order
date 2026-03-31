'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { Supplier, SupplierFormData } from './types'
import { EMPTY_FORM, CATEGORIES, PAYMENT_TYPES } from './types'

interface SupplierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTarget: Supplier | null
  onSubmit: (data: SupplierFormData) => Promise<void>
}

export function SupplierFormDialog({ open, onOpenChange, editTarget, onSubmit }: SupplierFormDialogProps) {
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
  const [form, setForm] = useState<SupplierFormData>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

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
        companyName: editTarget.companyName ?? '',
        taxId: editTarget.taxId ?? '',
        address: editTarget.address ?? '',
        deliveryDays: editTarget.deliveryDays != null ? String(editTarget.deliveryDays) : '',
        freeShippingMin: editTarget.freeShippingMin != null ? String(editTarget.freeShippingMin) : '',
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
    if (!form.name.trim()) { toast.error('供應商名稱不能為空'); return }
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
          <div className="space-y-1.5">
            <Label htmlFor="sup-name">供應商名稱 *</Label>
            <Input id="sup-name" placeholder="例：以曜" value={form.name} onChange={(e) => handleFieldChange('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-company-name">公司名稱</Label>
            <Input id="sup-company-name" placeholder="例：以曜食品股份有限公司" value={form.companyName} onChange={(e) => handleFieldChange('companyName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-tax-id">統一編號</Label>
            <Input id="sup-tax-id" placeholder="例：12345678" value={form.taxId} onChange={(e) => handleFieldChange('taxId', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>類別</Label>
            <Select value={form.category} onValueChange={(v) => handleFieldChange('category', v ?? '')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="選擇類別" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>結帳方式</Label>
            <Select value={form.paymentType} onValueChange={(v) => handleFieldChange('paymentType', v ?? '月結')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="選擇結帳方式" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map((pt) => <SelectItem key={pt} value={pt}>{pt}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-contact">聯絡人</Label>
            <Input id="sup-contact" placeholder="業務姓名" value={form.contact} onChange={(e) => handleFieldChange('contact', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-phone">電話</Label>
            <Input id="sup-phone" placeholder="0912-345-678" value={form.phone} onChange={(e) => handleFieldChange('phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-no-delivery">配送限制</Label>
            <Input id="sup-no-delivery" placeholder="例：週日、提前7-14天" value={form.no_delivery} onChange={(e) => handleFieldChange('no_delivery', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-address">地址</Label>
            <Textarea id="sup-address" placeholder="公司或倉庫地址" rows={2} value={form.address} onChange={(e) => handleFieldChange('address', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sup-delivery-days">送貨天數</Label>
              <Input id="sup-delivery-days" type="number" min={0} placeholder="例：1" value={form.deliveryDays} onChange={(e) => handleFieldChange('deliveryDays', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-free-shipping">免運金額（元）</Label>
              <Input id="sup-free-shipping" type="number" min={0} placeholder="0 = 無門檻" value={form.freeShippingMin} onChange={(e) => handleFieldChange('freeShippingMin', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-memo">備註</Label>
            <Textarea id="sup-memo" placeholder="其他說明..." rows={2} value={form.memo} onChange={(e) => handleFieldChange('memo', e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={submitting} />}>取消</DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />儲存中...</> : editTarget ? '儲存變更' : '新增'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
