'use client'

/**
 * 叫貨單管理頁
 * 功能：
 * 1. 選擇日期 → 看該日所有供應商的叫貨單
 * 2. 「產生叫貨單」按鈕 → 從 order_items 自動拆單
 * 3. 每張叫貨單顯示：品名 | 林森 | 信義安和 | 合計
 * 4. 匯出文字格式（無價格，給供應商看）
 * 5. 管理員可看到成本
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  RefreshCw, FileText, Copy, Check, Loader2,
} from 'lucide-react'

// ── 型別 ──

interface POItem {
  id: number
  itemId: number
  itemName: string
  itemCategory: string
  itemUnit: string
  storeId: number
  storeName: string
  quantity: string
  unit: string | null
  notes: string | null
  costPrice: number
}

interface PurchaseOrder {
  id: number
  supplierId: number
  supplierName: string
  supplierCategory: string
  deliveryDate: string
  poNumber: string
  totalAmount: number
  status: string
  notes: string | null
  items: POItem[]
}

interface GroupedItem {
  itemName: string
  itemUnit: string
  notes: string | null
  costPrice: number
  stores: Record<string, number>
  total: number
}

const STATUS_LABELS: Record<string, string> = {
  draft: '待確認',
  confirmed: '已確認',
  sent: '已送出',
  received: '已驗收',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  received: 'bg-gray-100 text-gray-700',
}

export default function PurchaseOrdersPage() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [pos, setPOs] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [userRole, setUserRole] = useState<string>('staff')

  // 讀取使用者角色
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUserRole(data.role) })
      .catch(() => {})
  }, [])

  const fetchPOs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders?date=${date}`)
      const data = await res.json()
      setPOs(data.purchaseOrders || [])
    } catch {
      toast.error('載入失敗')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { fetchPOs() }, [fetchPOs])

  // 產生叫貨單
  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '產生失敗')
        return
      }
      toast.success(data.message)
      fetchPOs()
    } catch {
      toast.error('產生失敗')
    } finally {
      setGenerating(false)
    }
  }

  // 更新狀態
  const updateStatus = async (poId: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        toast.success('狀態已更新')
        fetchPOs()
      }
    } catch {
      toast.error('更新失敗')
    }
  }

  // 複製叫貨單文字
  const copyPOText = async (po: PurchaseOrder) => {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}?export=1`)
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      setCopiedId(po.id)
      toast.success(`已複製 ${po.supplierName} 叫貨單`)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('複製失敗')
    }
  }

  // 將 PO items 按品項分組（合併各店數量）
  const groupItems = (poItems: POItem[]): { storeNames: string[]; grouped: GroupedItem[] } => {
    const storeNames = [...new Set(poItems.map(i => i.storeName))].sort()
    const map = new Map<string, GroupedItem>()

    for (const pi of poItems) {
      const key = pi.itemName
      if (!map.has(key)) {
        map.set(key, {
          itemName: pi.itemName,
          itemUnit: pi.unit || pi.itemUnit,
          notes: pi.notes,
          costPrice: pi.costPrice,
          stores: {},
          total: 0,
        })
      }
      const entry = map.get(key)!
      const qty = parseFloat(pi.quantity) || 0
      entry.stores[pi.storeName] = (entry.stores[pi.storeName] || 0) + qty
      entry.total += qty
    }

    return { storeNames, grouped: [...map.values()] }
  }

  const showCost = userRole === 'admin' || userRole === 'buyer'

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="font-heading font-semibold text-lg">供應商叫貨單</h2>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
          <Button onClick={handleGenerate} disabled={generating} className="gap-1.5">
            {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {generating ? '產生中...' : '產生叫貨單'}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 載入中...
        </div>
      )}

      {/* 無資料 */}
      {!loading && pos.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileText className="size-8 mx-auto mb-2 opacity-50" />
            <p>{date} 尚無叫貨單</p>
            <p className="text-xs mt-1">請先確認各店訂單，再按「產生叫貨單」</p>
          </CardContent>
        </Card>
      )}

      {/* 叫貨單列表 */}
      {pos.map((po) => {
        const { storeNames, grouped } = groupItems(po.items)
        return (
          <Card key={po.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{po.supplierName}</CardTitle>
                  <Badge className={STATUS_COLORS[po.status] || 'bg-gray-100'}>
                    {STATUS_LABELS[po.status] || po.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {grouped.length} 品項
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {po.status === 'draft' && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => updateStatus(po.id, 'confirmed')}
                    >
                      確認
                    </Button>
                  )}
                  {po.status === 'confirmed' && (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => updateStatus(po.id, 'sent')}
                    >
                      標記已送出
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => copyPOText(po)}
                    className="gap-1"
                  >
                    {copiedId === po.id
                      ? <><Check className="size-3.5" /> 已複製</>
                      : <><Copy className="size-3.5" /> 複製</>
                    }
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[120px]">品名</TableHead>
                      {storeNames.map(s => (
                        <TableHead key={s} className="text-center min-w-[60px]">{s}</TableHead>
                      ))}
                      <TableHead className="text-center font-semibold">合計</TableHead>
                      <TableHead>單位</TableHead>
                      {grouped.some(g => g.notes) && (
                        <TableHead>備註</TableHead>
                      )}
                      {showCost && (
                        <TableHead className="text-right">進貨價</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped.map((g) => (
                      <TableRow key={g.itemName}>
                        <TableCell className="font-medium">{g.itemName}</TableCell>
                        {storeNames.map(s => (
                          <TableCell key={s} className="text-center">
                            {g.stores[s] || ''}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-semibold">{g.total}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{g.itemUnit}</TableCell>
                        {grouped.some(gg => gg.notes) && (
                          <TableCell className="text-xs text-muted-foreground">{g.notes || ''}</TableCell>
                        )}
                        {showCost && (
                          <TableCell className="text-right text-xs">${g.costPrice}</TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
