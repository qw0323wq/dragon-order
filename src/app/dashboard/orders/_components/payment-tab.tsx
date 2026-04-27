'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Loader2, CreditCard, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { OrderDetail, SupplierPaymentInfo } from './types'
import { sumBy, formatCurrency } from '@/lib/format'

interface PaymentTabProps {
  details: OrderDetail[]
  orderId: number
}

export function PaymentTab({ details, orderId }: PaymentTabProps) {
  const [paidSuppliers, setPaidSuppliers] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState<number | null>(null)

  const supplierPayments = useMemo<SupplierPaymentInfo[]>(() => {
    // Step 1: 累加每家 supplier 的 totalAmount + actualSubtotal 加總
    //   - actualSubtotalSum：已驗收明細的應付小計合（未驗收的 actualSubtotal=null 跳過）
    //   - itemCount / receivedItemCount：判斷該供應商是否完全驗收
    type PaymentAggr = SupplierPaymentInfo & {
      itemCount: number
      receivedItemCount: number
      actualSubtotalSum: number
    }
    const map = new Map<number, PaymentAggr>()
    for (const d of details) {
      if (!map.has(d.supplierId)) {
        map.set(d.supplierId, {
          supplierId: d.supplierId,
          supplierName: d.supplierName,
          paymentType: '月結',
          totalAmount: 0,
          payableAmount: null,
          isPaid: false,
          itemCount: 0,
          receivedItemCount: 0,
          actualSubtotalSum: 0,
        })
      }
      const e = map.get(d.supplierId)!
      e.totalAmount += d.subtotal
      e.itemCount += 1
      if (d.actualSubtotal !== null && d.actualSubtotal !== undefined) {
        e.receivedItemCount += 1
        e.actualSubtotalSum += d.actualSubtotal
      }
    }
    // Step 2: 全部驗收完才有 payableAmount，否則為 null（畫面顯示「-」）
    return Array.from(map.values()).map((e) => ({
      supplierId: e.supplierId,
      supplierName: e.supplierName,
      paymentType: e.paymentType,
      totalAmount: e.totalAmount,
      payableAmount:
        e.itemCount > 0 && e.receivedItemCount === e.itemCount
          ? e.actualSubtotalSum
          : null,
      isPaid: e.isPaid,
    }))
  }, [details])

  async function handleMarkPaid(supplierId: number, supplierName: string, amount: number) {
    setSubmitting(supplierId)
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, supplierId, amount, paymentType: '現結', status: 'paid' }),
      })

      if (res.ok || res.status === 409) {
        if (res.status === 409) {
          const existing = await res.json()
          if (existing?.id) {
            await fetch('/api/payments', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentId: existing.id, status: 'paid' }),
            })
          }
        }
        setPaidSuppliers((prev) => new Set([...prev, supplierId]))
        toast.success(`已標記 ${supplierName} 付款完成`)
      } else {
        toast.error('標記付款失敗')
      }
    } catch {
      toast.error('發生錯誤')
    } finally {
      setSubmitting(null)
    }
  }

  const grandTotal = sumBy(supplierPayments, s => s.totalAmount)
  // 應付總額：全部供應商都驗收完才算總應付，否則顯示「-」
  const allReceived = supplierPayments.every((s) => s.payableAmount !== null)
  const grandPayable = allReceived
    ? sumBy(supplierPayments, s => s.payableAmount ?? 0)
    : null
  const paidTotal = sumBy(
    supplierPayments.filter((s) => paidSuppliers.has(s.supplierId)),
    s => s.payableAmount ?? s.totalAmount,
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">採購總計</p>
            <p className="text-xl font-bold text-primary font-heading">{formatCurrency(grandTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">應付總計</p>
            <p className="text-xl font-bold text-orange-600 font-heading">
              {grandPayable === null ? <span className="text-muted-foreground">—</span> : formatCurrency(grandPayable)}
            </p>
            {grandPayable === null && (
              <p className="text-[10px] text-muted-foreground mt-0.5">未完成驗收</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">已付金額</p>
            <p className="text-xl font-bold text-green-600 font-heading">{formatCurrency(paidTotal)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>供應商</TableHead>
                <TableHead>結帳方式</TableHead>
                <TableHead className="text-right">採購金額</TableHead>
                <TableHead className="text-right">應付金額</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierPayments.map((s) => {
                const isPaid = paidSuppliers.has(s.supplierId)
                // 標記付款用「應付」，未驗收完則 fallback「採購」
                const payAmount = s.payableAmount ?? s.totalAmount
                return (
                  <TableRow key={s.supplierId} className={isPaid ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{s.supplierName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        s.paymentType === '現結'
                          ? 'border-red-200 text-red-700 bg-red-50'
                          : 'border-blue-200 text-blue-700 bg-blue-50'
                      }>
                        {s.paymentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(s.totalAmount)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {s.payableAmount === null ? (
                        <span className="text-muted-foreground text-xs">未驗收</span>
                      ) : (
                        <span className={s.payableAmount !== s.totalAmount ? 'text-orange-600' : ''}>
                          {formatCurrency(s.payableAmount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isPaid ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 className="size-3.5" /> 已付款
                        </span>
                      ) : s.paymentType === '月結' ? (
                        <span className="text-xs text-blue-600 font-medium">月結</span>
                      ) : (
                        <Button
                          size="sm" variant="outline" className="h-7 text-xs gap-1"
                          disabled={submitting === s.supplierId}
                          onClick={() => handleMarkPaid(s.supplierId, s.supplierName, payAmount)}
                        >
                          {submitting === s.supplierId
                            ? <Loader2 className="size-3 animate-spin" />
                            : <CreditCard className="size-3" />
                          }
                          標記已付款
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={2}>合計</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(grandTotal)}</TableCell>
                <TableCell className="text-right text-primary">
                  {grandPayable === null ? (
                    <span className="text-muted-foreground text-xs">未完成驗收</span>
                  ) : (
                    formatCurrency(grandPayable)
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
