'use client'

/**
 * 供應商品項詳情頁
 * 功能：
 * 1. 顯示該供應商所有品項（進貨價、店家採購價、售價）
 * 2. 編輯品項價格/名稱
 * 3. 刪除品項（軟刪除）
 * 4. 新增品項
 * 5. 上傳報價單 Excel → 自動更新/新增
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Plus, Pencil, Trash2, Upload, Loader2, FileSpreadsheet, RotateCcw, ChevronDown, ChevronRight,
} from 'lucide-react'

interface ItemData {
  id: number
  name: string
  category: string
  unit: string
  costPrice: number
  storePrice: number
  sellPrice: number
  spec: string | null
  isActive: boolean
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supplierId = parseInt(id)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [supplierName, setSupplierName] = useState('')
  const [items, setItems] = useState<ItemData[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  // Dialog
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingItem, setEditingItem] = useState<ItemData | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formUnit, setFormUnit] = useState('')
  const [formCostPrice, setFormCostPrice] = useState('')
  const [formStorePrice, setFormStorePrice] = useState('')
  const [formSellPrice, setFormSellPrice] = useState('')
  const [formSpec, setFormSpec] = useState('')

  // Upload result
  const [uploadResult, setUploadResult] = useState<{ updated: number; created: number } | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // 預約改價排程（key: itemId）
  const [pendingSchedules, setPendingSchedules] = useState<Record<number, { newCostPrice: number; effectiveDate: string }>>({})

  const fetchData = useCallback(async () => {
    try {
      const [suppRes, itemsRes] = await Promise.all([
        fetch('/api/suppliers'),
        fetch(`/api/suppliers/${supplierId}/items`),
      ])
      const suppliers = await suppRes.json()
      const supplier = (suppliers as { id: number; name: string }[]).find(s => s.id === supplierId)
      setSupplierName(supplier?.name || `供應商 #${supplierId}`)
      setItems(await itemsRes.json())

      // 載入該供應商品項的 pending 排程
      const schedRes = await fetch(`/api/price-schedule?status=pending&supplier_id=${supplierId}`)
      const schedData = await schedRes.json()
      const map: Record<number, { newCostPrice: number; effectiveDate: string }> = {}
      if (Array.isArray(schedData)) {
        for (const s of schedData) {
          map[s.itemId] = { newCostPrice: s.newCostPrice, effectiveDate: s.effectiveDate }
        }
      }
      setPendingSchedules(map)
    } catch {
      toast.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  useEffect(() => { fetchData() }, [fetchData])

  const activeItems = items.filter(i => i.isActive)
  const inactiveItems = items.filter(i => !i.isActive)

  // ─── 編輯 ───
  const openEdit = (item: ItemData) => {
    setEditingItem(item)
    setFormName(item.name)
    setFormCategory(item.category)
    setFormUnit(item.unit)
    setFormCostPrice(String(item.costPrice))
    setFormStorePrice(String(item.storePrice))
    setFormSellPrice(String(item.sellPrice))
    setFormSpec(item.spec || '')
    setShowEditDialog(true)
  }

  const handleEdit = async () => {
    if (!editingItem) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/items/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          category: formCategory,
          unit: formUnit,
          costPrice: parseInt(formCostPrice) || 0,
          storePrice: parseInt(formStorePrice) || 0,
          sellPrice: parseInt(formSellPrice) || 0,
          spec: formSpec || null,
        }),
      })
      if (res.ok) {
        toast.success('已更新')
        setShowEditDialog(false)
        fetchData()
      }
    } catch {
      toast.error('更新失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── 新增 ───
  const openAdd = () => {
    setFormName('')
    setFormCategory('')
    setFormUnit('份')
    setFormCostPrice('')
    setFormStorePrice('')
    setFormSellPrice('')
    setFormSpec('')
    setShowAddDialog(true)
  }

  const handleAdd = async () => {
    if (!formName.trim()) { toast.error('品名不能為空'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          category: formCategory || '其他',
          unit: formUnit || '份',
          costPrice: parseInt(formCostPrice) || 0,
          storePrice: parseInt(formStorePrice) || 0,
          sellPrice: parseInt(formSellPrice) || 0,
          spec: formSpec || null,
        }),
      })
      if (res.ok) {
        toast.success(`已新增 ${formName}`)
        setShowAddDialog(false)
        fetchData()
      }
    } catch {
      toast.error('新增失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── 刪除 ───
  const handleDelete = async (item: ItemData) => {
    if (!confirm(`確定要刪除「${item.name}」嗎？`)) return
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(`已刪除 ${item.name}`)
        fetchData()
      }
    } catch {
      toast.error('刪除失敗')
    }
  }

  // ─── 重新上架 ───
  const handleReactivate = async (item: ItemData) => {
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      if (res.ok) {
        toast.success(`已重新上架「${item.name}」`)
        fetchData()
      }
    } catch {
      toast.error('操作失敗')
    }
  }

  // ─── 上傳報價單 ───
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadResult(null)

    try {
      // 用 XLSX 在 client 解析
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)

      // 嘗試匹配欄位名稱
      const uploadItems = rows
        .map((row) => {
          const name = (row['品名'] || row['品項'] || row['名稱'] || row['name'] || '') as string
          const costPrice = parseInt(String(row['進貨價'] || row['成本'] || row['單價'] || row['cost'] || row['含稅價'] || 0))
          const unit = (row['單位'] || row['unit'] || '') as string
          const category = (row['分類'] || row['類別'] || row['category'] || '') as string
          const spec = (row['規格'] || row['spec'] || '') as string
          return { name: name.trim(), costPrice, unit, category, spec }
        })
        .filter((i) => i.name)

      if (uploadItems.length === 0) {
        toast.error('Excel 中沒有找到有效的品項資料')
        return
      }

      // 送到 API 批次更新
      const res = await fetch(`/api/suppliers/${supplierId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: uploadItems }),
      })
      const result = await res.json()

      if (res.ok) {
        setUploadResult({ updated: result.updated, created: result.created })
        toast.success(result.message)
        fetchData()
      } else {
        toast.error(result.error || '上傳失敗')
      }
    } catch (err) {
      toast.error('檔案解析失敗，請確認格式')
      console.error(err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> 載入中...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/suppliers')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h2 className="font-heading font-semibold text-lg">{supplierName}</h2>
            <p className="text-sm text-muted-foreground">{activeItems.length} 個品項</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 上傳報價單 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-1.5"
          >
            {uploading
              ? <><Loader2 className="size-4 animate-spin" /> 匯入中...</>
              : <><Upload className="size-4" /> 上傳報價單</>
            }
          </Button>
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="size-4" /> 新增品項
          </Button>
        </div>
      </div>

      {/* 上傳結果 */}
      {uploadResult && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-3 flex items-center gap-2 text-sm text-green-700">
            <FileSpreadsheet className="size-4" />
            報價單匯入完成：更新 {uploadResult.updated} 個、新增 {uploadResult.created} 個品項
          </CardContent>
        </Card>
      )}

      {/* 上傳說明 */}
      <Card className="border-dashed">
        <CardContent className="py-3 text-xs text-muted-foreground">
          📄 報價單 Excel 欄位對應：品名（必填）、進貨價/成本/單價/含稅價、單位、分類、規格。品名相同自動更新價格，新品名自動新增。
        </CardContent>
      </Card>

      {/* 品項列表 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">品名</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>單位</TableHead>
                  <TableHead className="text-right">進貨價</TableHead>
                  <TableHead className="text-right">店家採購價</TableHead>
                  <TableHead className="text-right">售價</TableHead>
                  <TableHead>規格</TableHead>
                  <TableHead className="text-right w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      尚無品項，請新增或上傳報價單
                    </TableCell>
                  </TableRow>
                )}
                {activeItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{item.unit}</TableCell>
                    <TableCell className="text-right">
                      ${item.costPrice}
                      {pendingSchedules[item.id] && (
                        <span className="ml-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                          {pendingSchedules[item.id].effectiveDate.slice(5)} 起→${pendingSchedules[item.id].newCostPrice}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.storePrice > 0 ? `$${item.storePrice}` : <span className="text-muted-foreground text-xs">自動</span>}
                    </TableCell>
                    <TableCell className="text-right">${item.sellPrice}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">{item.spec}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(item)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(item)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 已停用品項 */}
      {inactiveItems.length > 0 && (
        <Card>
          <CardHeader
            className="pb-2 cursor-pointer select-none"
            onClick={() => setShowInactive(!showInactive)}
          >
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-1.5">
              {showInactive ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              已停用品項 ({inactiveItems.length})
            </CardTitle>
          </CardHeader>
          {showInactive && (
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>品名</TableHead>
                      <TableHead>分類</TableHead>
                      <TableHead>單位</TableHead>
                      <TableHead className="text-right">進貨價</TableHead>
                      <TableHead className="text-right w-[80px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inactiveItems.map((item) => (
                      <TableRow key={item.id} className="opacity-60 hover:opacity-100 transition-opacity">
                        <TableCell className="line-through text-muted-foreground">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{item.unit}</TableCell>
                        <TableCell className="text-right text-muted-foreground">${item.costPrice}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs h-7"
                            onClick={() => handleReactivate(item)}
                          >
                            <RotateCcw className="size-3" /> 上架
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ─── 編輯 Dialog ─── */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>編輯 {editingItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>品名</Label><Input value={formName} onChange={e => setFormName(e.target.value)} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>分類</Label><Input value={formCategory} onChange={e => setFormCategory(e.target.value)} className="mt-1" /></div>
              <div><Label>單位</Label><Input value={formUnit} onChange={e => setFormUnit(e.target.value)} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>進貨價</Label><Input type="number" value={formCostPrice} onChange={e => setFormCostPrice(e.target.value)} className="mt-1" /></div>
              <div><Label>店家價</Label><Input type="number" value={formStorePrice} onChange={e => setFormStorePrice(e.target.value)} className="mt-1" placeholder="0=自動" /></div>
              <div><Label>售價</Label><Input type="number" value={formSellPrice} onChange={e => setFormSellPrice(e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>規格</Label><Input value={formSpec} onChange={e => setFormSpec(e.target.value)} className="mt-1" placeholder="例：一開四" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? '儲存中...' : '儲存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 新增 Dialog ─── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>新增品項</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>品名 *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>分類</Label><Input value={formCategory} onChange={e => setFormCategory(e.target.value)} className="mt-1" placeholder="其他" /></div>
              <div><Label>單位</Label><Input value={formUnit} onChange={e => setFormUnit(e.target.value)} className="mt-1" placeholder="份" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>進貨價</Label><Input type="number" value={formCostPrice} onChange={e => setFormCostPrice(e.target.value)} className="mt-1" /></div>
              <div><Label>店家價</Label><Input type="number" value={formStorePrice} onChange={e => setFormStorePrice(e.target.value)} className="mt-1" placeholder="0=自動" /></div>
              <div><Label>售價</Label><Input type="number" value={formSellPrice} onChange={e => setFormSellPrice(e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>規格</Label><Input value={formSpec} onChange={e => setFormSpec(e.target.value)} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={submitting}>{submitting ? '新增中...' : '新增'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
