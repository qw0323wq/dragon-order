'use client'

/**
 * 供應商管理頁面（組裝入口）
 * 子元件在 _components/ 資料夾
 */

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

import type { Supplier, SupplierFormData } from './_components/types'
import { CATEGORY_COLORS } from './_components/types'
import { SupplierCard } from './_components/supplier-card'
import { SupplierFormDialog } from './_components/supplier-form-dialog'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('全部')

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

  useEffect(() => { loadSuppliers() }, [])

  function handleAddNew() { setEditTarget(null); setDialogOpen(true) }
  function handleEdit(supplier: Supplier) { setEditTarget(supplier); setDialogOpen(true) }

  async function handleDelete(id: number) {
    if (!confirm('確定要刪除這個供應商嗎？')) return
    setSuppliers((prev) => prev.filter((s) => s.id !== id))
    toast.success('已刪除供應商')
  }

  async function handleSubmit(data: SupplierFormData) {
    const deliveryDaysNum = data.deliveryDays.trim() !== '' ? Number(data.deliveryDays) : null
    const freeShippingMinNum = data.freeShippingMin.trim() !== '' ? Number(data.freeShippingMin) : null
    const payload = {
      name: data.name, category: data.category,
      contact: data.contact || null, phone: data.phone || null,
      notes: data.memo || null, paymentType: data.paymentType,
      companyName: data.companyName || null, taxId: data.taxId || null,
      address: data.address || null, deliveryDays: deliveryDaysNum, freeShippingMin: freeShippingMinNum,
    }

    if (editTarget) {
      const res = await fetch('/api/suppliers', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editTarget.id, ...payload }),
      })
      if (!res.ok) { toast.error('更新失敗'); return }
      toast.success(`已更新 ${data.name}`)
    } else {
      const res = await fetch('/api/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { toast.error('新增失敗'); return }
      toast.success(`已新增 ${data.name}`)
    }
    await loadSuppliers()
  }

  const availableCategories = useMemo(() => {
    const cats = [...new Set(suppliers.map((s) => s.category))].sort()
    return ['全部', ...cats]
  }, [suppliers])

  const grouped = useMemo(() => {
    const filtered = categoryFilter === '全部' ? suppliers : suppliers.filter((s) => s.category === categoryFilter)
    const groups: Record<string, Supplier[]> = {}
    for (const s of filtered) {
      if (!groups[s.category]) groups[s.category] = []
      groups[s.category].push(s)
    }
    return groups
  }, [suppliers, categoryFilter])

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">供應商管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">共 {suppliers.length} 家供應商</p>
        </div>
        <Button className="gap-1.5" onClick={handleAddNew}>
          <Plus className="size-4" /> 新增供應商
        </Button>
      </div>

      {/* 分類篩選 */}
      <div className="flex flex-wrap gap-1.5">
        {availableCategories.map((cat) => {
          const isActive = categoryFilter === cat
          const count = cat === '全部' ? suppliers.length : suppliers.filter((s) => s.category === cat).length
          const catStyle = CATEGORY_COLORS[cat]
          return (
            <button key={cat} onClick={() => setCategoryFilter(cat)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive ? (catStyle ?? 'bg-primary text-primary-foreground') : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}>
              {cat} <span className="opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && Object.entries(grouped).map(([category, list]) => (
        <div key={category} className="space-y-3">
          {categoryFilter === '全部' && (
            <div className="flex items-center gap-2 pt-2">
              <span className={`inline-flex h-6 items-center rounded-full px-3 text-xs font-semibold ${
                CATEGORY_COLORS[category] ?? 'bg-muted text-muted-foreground'
              }`}>
                {category}
              </span>
              <span className="text-xs text-muted-foreground">{list.length} 家</span>
              <div className="flex-1 border-t border-border" />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      ))}

      {!loading && suppliers.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          尚無供應商，點選「新增供應商」建立第一筆
        </div>
      )}

      <SupplierFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editTarget={editTarget} onSubmit={handleSubmit} />
    </div>
  )
}
