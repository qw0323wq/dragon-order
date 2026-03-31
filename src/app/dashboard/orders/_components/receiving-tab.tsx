'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, ClipboardCheck, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { ReceivingRecord, ReceivingInput } from './types'
import { RESULT_OPTIONS } from './types'

interface ReceivingTabProps {
  orderId: number
}

export function ReceivingTab({ orderId }: ReceivingTabProps) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [items, setItems] = useState<Array<{
    orderItemId: number
    quantity: string
    unit: string
    itemName: string
    supplierName: string
    storeName: string
  }>>([])
  const [receivings, setReceivings] = useState<ReceivingRecord[]>([])
  const [inputs, setInputs] = useState<Record<number, ReceivingInput>>({})

  const loadReceiving = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/receiving?orderId=${orderId}`)
      const { details, receivings: recs } = await res.json()
      setItems(details)
      setReceivings(recs)

      const newInputs: Record<number, ReceivingInput> = {}
      for (const item of details) {
        const existing = recs.find((r: ReceivingRecord) => r.orderItemId === item.orderItemId)
        newInputs[item.orderItemId] = {
          receivedQty: existing ? existing.receivedQty : '',
          result: existing ? existing.result : '正常',
          issue: existing?.issue ?? '',
        }
      }
      setInputs(newInputs)
    } catch {
      toast.error('載入驗收資料失敗')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { loadReceiving() }, [loadReceiving])

  const receivedIds = new Set(receivings.map((r) => r.orderItemId))

  function handleInputChange(orderItemId: number, field: keyof ReceivingInput, value: string) {
    setInputs((prev) => ({
      ...prev,
      [orderItemId]: { ...prev[orderItemId], [field]: value },
    }))
  }

  async function handleSubmitAll() {
    setSubmitting(true)
    try {
      const records = items.map((item) => {
        const input = inputs[item.orderItemId] ?? { receivedQty: '', result: '正常', issue: '' }
        return {
          orderItemId: item.orderItemId,
          receivedQty: input.receivedQty || item.quantity,
          result: input.result || '正常',
          issue: input.issue || null,
        }
      })

      const res = await fetch('/api/receiving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })

      if (!res.ok) { toast.error('驗收送出失敗'); return }
      toast.success('全部驗收完成！')
      await loadReceiving()
    } catch {
      toast.error('發生錯誤')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const receivedCount = items.filter((i) => receivedIds.has(i.orderItemId)).length
  const allDone = items.length > 0 && receivedCount === items.length

  const supplierGroups = new Map<string, typeof items>()
  for (const item of items) {
    if (!supplierGroups.has(item.supplierName)) supplierGroups.set(item.supplierName, [])
    supplierGroups.get(item.supplierName)!.push(item)
  }

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
        allDone ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'
      }`}>
        {allDone ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        {allDone ? '全部驗收完成！' : `驗收進度：${receivedCount} / ${items.length} 項`}
      </div>

      {Array.from(supplierGroups.entries()).map(([supplierName, supplierItems]) => {
        const allSupplierReceived = supplierItems.every((i) => receivedIds.has(i.orderItemId))
        return (
          <Card key={supplierName} className={allSupplierReceived ? 'border-green-200' : ''}>
            <CardHeader className="border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{supplierName}</CardTitle>
                {allSupplierReceived && (
                  <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                    <CheckCircle2 className="size-3" /> 已驗收
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>品項</TableHead>
                    <TableHead>門市</TableHead>
                    <TableHead className="text-right">訂購量</TableHead>
                    <TableHead>實收量</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>異常說明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierItems.map((item) => {
                    const input = inputs[item.orderItemId] ?? { receivedQty: '', result: '正常', issue: '' }
                    const isReceived = receivedIds.has(item.orderItemId)
                    const qty = parseFloat(item.quantity)
                    const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
                    return (
                      <TableRow key={item.orderItemId} className={isReceived ? 'bg-green-50/50' : ''}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {isReceived && <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />}
                            {item.itemName}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.storeName}</TableCell>
                        <TableCell className="text-right text-sm">{qtyStr} {item.unit}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" step="0.5" min="0"
                              className="w-20 h-8 text-sm text-center"
                              placeholder={qtyStr}
                              value={input.receivedQty}
                              onChange={(e) => handleInputChange(item.orderItemId, 'receivedQty', e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">{item.unit}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select value={input.result} onValueChange={(v) => handleInputChange(item.orderItemId, 'result', v ?? '正常')}>
                            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {RESULT_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {input.result !== '正常' && (
                            <Input
                              className="w-32 h-8 text-xs" placeholder="說明"
                              value={input.issue}
                              onChange={(e) => handleInputChange(item.orderItemId, 'issue', e.target.value)}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}

      {!allDone && (
        <Button className="w-full h-11 gap-2" onClick={handleSubmitAll} disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
          送出全部驗收
        </Button>
      )}
    </div>
  )
}
