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

interface PaymentTabProps {
  details: OrderDetail[]
  orderId: number
}

export function PaymentTab({ details, orderId }: PaymentTabProps) {
  const [paidSuppliers, setPaidSuppliers] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState<number | null>(null)

  const supplierPayments = useMemo<SupplierPaymentInfo[]>(() => {
    const map = new Map<number, SupplierPaymentInfo>()
    for (const d of details) {
      if (!map.has(d.supplierId)) {
        map.set(d.supplierId, {
          supplierId: d.supplierId,
          supplierName: d.supplierName,
          paymentType: '月結',
          totalAmount: 0,
          isPaid: false,
        })
      }
      map.get(d.supplierId)!.totalAmount += d.subtotal
    }
    return Array.from(map.values())
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

  const grandTotal = supplierPayments.reduce((sum, s) => sum + s.totalAmount, 0)
  const paidTotal = supplierPayments
    .filter((s) => paidSuppliers.has(s.supplierId))
    .reduce((sum, s) => sum + s.totalAmount, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">採購總計</p>
            <p className="text-xl font-bold text-primary font-heading">${grandTotal.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">已付金額</p>
            <p className="text-xl font-bold text-green-600 font-heading">${paidTotal.toLocaleString()}</p>
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
                <TableHead className="text-right">金額</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierPayments.map((s) => {
                const isPaid = paidSuppliers.has(s.supplierId)
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
                    <TableCell className="text-right font-semibold">${s.totalAmount.toLocaleString()}</TableCell>
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
                          onClick={() => handleMarkPaid(s.supplierId, s.supplierName, s.totalAmount)}
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
                <TableCell className="text-right text-primary">${grandTotal.toLocaleString()}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
