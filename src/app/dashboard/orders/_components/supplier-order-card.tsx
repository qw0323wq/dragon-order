'use client'

import { toast } from 'sonner'
import { useState } from 'react'
import { ClipboardCopy, CheckCircle, Pencil, Trash2, Save, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { sumBy, formatCurrency } from '@/lib/format'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { OrderDetail } from './types'
import { buildOrderText } from './types'

interface SupplierCardProps {
  supplier: string
  items: OrderDetail[]
  ordered: boolean
  onMarkOrdered: (supplier: string) => void
  orderId?: number
  onRefresh?: () => void
}

export function SupplierOrderCard({ supplier, items, ordered, onMarkOrdered, orderId, onRefresh }: SupplierCardProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editQty, setEditQty] = useState('')

  async function handleUpdateQty(orderItemId: number) {
    if (!orderId || !editQty) return
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updateItem', orderItemId, quantity: parseFloat(editQty) }),
    })
    if (res.ok) {
      toast.success('數量已更新')
      setEditingId(null)
      onRefresh?.()
    } else { toast.error('更新失敗') }
  }

  async function handleDeleteItem(orderItemId: number, itemName: string) {
    if (!orderId || !confirm(`確定要刪除「${itemName}」？`)) return
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteItem', orderItemId }),
    })
    if (res.ok) {
      toast.success(`已刪除 ${itemName}`)
      onRefresh?.()
    } else { toast.error('刪除失敗') }
  }
  const subtotal = sumBy(items, i => i.subtotal)

  async function handleCopy() {
    const text = buildOrderText(items)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`已複製 ${supplier} 的叫貨文字`)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      toast.success(`已複製 ${supplier} 的叫貨文字`)
    }
  }

  const byStore = new Map<string, OrderDetail[]>()
  for (const item of items) {
    if (!byStore.has(item.storeName)) byStore.set(item.storeName, [])
    byStore.get(item.storeName)!.push(item)
  }

  return (
    <Card className={ordered ? 'opacity-70' : ''}>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{supplier}</CardTitle>
            {ordered && (
              <Badge variant="default" className="gap-1">
                <CheckCircle className="size-3" />
                已叫貨
              </Badge>
            )}
          </div>
          <span className="text-sm font-semibold text-primary">
            小計 {formatCurrency(subtotal)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {Array.from(byStore.entries()).map(([storeName, storeItems], idx) => (
          <div key={storeName}>
            {idx > 0 && <Separator className="my-3" />}
            <p className="text-sm font-medium text-muted-foreground mb-2">{storeName}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品項</TableHead>
                  <TableHead className="text-right">數量</TableHead>
                  <TableHead className="text-right">單價</TableHead>
                  <TableHead className="text-right">小計</TableHead>
                  {storeItems.some(i => i.supplierNotes) && (
                    <TableHead>叫貨備註</TableHead>
                  )}
                  {orderId && <TableHead className="text-right w-20">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {storeItems.map((item) => {
                  const qty = parseFloat(item.quantity)
                  const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.itemName}</TableCell>
                      <TableCell className="text-right">
                        {editingId === item.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input type="number" min={0} step={0.5} className="w-16 h-7 text-sm text-right"
                              value={editQty} onChange={e => setEditQty(e.target.value)} autoFocus
                              onKeyDown={e => e.key === 'Enter' && handleUpdateQty(item.id)} />
                            <Button variant="ghost" size="icon" className="size-6 text-green-600" onClick={() => handleUpdateQty(item.id)}><Save className="size-3" /></Button>
                            <Button variant="ghost" size="icon" className="size-6" onClick={() => setEditingId(null)}><X className="size-3" /></Button>
                          </div>
                        ) : (
                          <span>{qtyStr} {item.unit}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.subtotal)}
                      </TableCell>
                      {storeItems.some(i => i.supplierNotes) && (
                        <TableCell className="text-xs text-muted-foreground">
                          {item.supplierNotes || ''}
                        </TableCell>
                      )}
                      {orderId && editingId !== item.id && (
                        <TableCell className="text-right">
                          <div className="flex items-center gap-0.5 justify-end">
                            <Button variant="ghost" size="icon" className="size-6" onClick={() => { setEditingId(item.id); setEditQty(String(qty)) }}>
                              <Pencil className="size-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-6 text-destructive" onClick={() => handleDeleteItem(item.id, item.itemName)}>
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                      {orderId && editingId === item.id && <TableCell />}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ))}

        <Separator className="my-3" />

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
            <ClipboardCopy className="size-3.5" />
            複製叫貨文字
          </Button>
          <Button
            variant={ordered ? 'secondary' : 'default'}
            size="sm"
            className="gap-1.5"
            onClick={() => onMarkOrdered(supplier)}
          >
            <CheckCircle className="size-3.5" />
            {ordered ? '取消標記' : '標記已叫貨'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
