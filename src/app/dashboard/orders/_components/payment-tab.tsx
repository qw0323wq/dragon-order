'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Loader2, CreditCard, CheckCircle2, X, ShoppingCart, Receipt } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { StatCard } from '@/components/ui/stat-card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { OrderDetail, SupplierPaymentInfo } from './types'
import { sumBy, formatCurrency, formatDateLocal } from '@/lib/format'

interface PaymentTabProps {
  details: OrderDetail[]
  orderId: number
}

export function PaymentTab({ details, orderId }: PaymentTabProps) {
  const [paidSuppliers, setPaidSuppliers] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState<number | null>(null)
  // inline 編輯：點「標記已付」→ 該行展開日期 input
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null)
  const [paidAtInputs, setPaidAtInputs] = useState<Record<number, string>>({})
  const today = formatDateLocal()

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

  async function handleMarkPaid(supplierId: number, supplierName: string, amount: number, paidAt: string) {
    setSubmitting(supplierId)
    try {
      // 走新的 batch upsert API（自動建立或更新 payments row）
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ orderId, supplierId, amount, status: 'paid', paidAt, paymentType: '現結' }],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || '標記付款失敗')
        return
      }
      setPaidSuppliers((prev) => new Set([...prev, supplierId]))
      toast.success(`已標記 ${supplierName} 付款完成（匯款日 ${paidAt}）`)
      setEditingSupplierId(null)
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="採購總計"
          value={<span className="text-primary">{formatCurrency(grandTotal)}</span>}
          icon={ShoppingCart}
          accent="bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
          hint="按訂購量 × 單價"
        />
        <StatCard
          label="應付總計"
          value={
            grandPayable === null
              ? <span className="text-muted-foreground">—</span>
              : <span className="text-orange-600 dark:text-orange-400">{formatCurrency(grandPayable)}</span>
          }
          icon={Receipt}
          accent="bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
          hint={grandPayable === null ? '未完成驗收' : '按實收 − 退貨'}
        />
        <StatCard
          label="已付金額"
          value={<span className="text-green-600 dark:text-green-400">{formatCurrency(paidTotal)}</span>}
          icon={CheckCircle2}
          accent="bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
          hint={`${paidSuppliers.size} / ${supplierPayments.length} 家已付`}
        />
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">供應商</TableHead>
                <TableHead>結帳方式</TableHead>
                <TableHead className="text-right">採購金額</TableHead>
                <TableHead className="text-right">應付金額</TableHead>
                <TableHead className="pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierPayments.map((s) => {
                const isPaid = paidSuppliers.has(s.supplierId)
                const isEditing = editingSupplierId === s.supplierId
                const isThisSubmitting = submitting === s.supplierId
                // 標記付款用「應付」，未驗收完則 fallback「採購」
                const payAmount = s.payableAmount ?? s.totalAmount
                return (
                  <TableRow key={s.supplierId} className={`hover:bg-muted/30 ${isPaid ? 'opacity-60' : ''}`}>
                    <TableCell className="pl-4 font-medium">{s.supplierName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        s.paymentType === '現結'
                          ? 'border-red-200 text-red-700 bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:bg-red-500/15'
                          : 'border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-500/30 dark:text-blue-400 dark:bg-blue-500/15'
                      }>
                        {s.paymentType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(s.totalAmount)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {s.payableAmount === null ? (
                        <span className="text-muted-foreground text-xs">未驗收</span>
                      ) : (
                        <span className={s.payableAmount !== s.totalAmount ? 'text-orange-600 dark:text-orange-400' : ''}>
                          {formatCurrency(s.payableAmount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      {isPaid ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 className="size-3.5" /> 已付款
                        </span>
                      ) : isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="date"
                            value={paidAtInputs[s.supplierId] ?? today}
                            onChange={(e) =>
                              setPaidAtInputs((prev) => ({ ...prev, [s.supplierId]: e.target.value }))
                            }
                            className="h-8 text-xs w-32 tabular-nums"
                          />
                          <Button
                            size="sm" variant="default" className="h-8 text-xs px-2.5"
                            disabled={isThisSubmitting}
                            onClick={() => handleMarkPaid(
                              s.supplierId, s.supplierName, payAmount,
                              paidAtInputs[s.supplierId] ?? today,
                            )}
                          >
                            {isThisSubmitting ? <Loader2 className="size-3 animate-spin" /> : '確認'}
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="size-8 px-0"
                            onClick={() => setEditingSupplierId(null)}
                            disabled={isThisSubmitting}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm" variant="outline" className="h-8 text-xs gap-1"
                          onClick={() => {
                            setPaidAtInputs((prev) => ({ ...prev, [s.supplierId]: today }))
                            setEditingSupplierId(s.supplierId)
                          }}
                        >
                          <CreditCard className="size-3" />
                          標記已付
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                <TableCell className="pl-4" colSpan={2}>合計</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(grandTotal)}</TableCell>
                <TableCell className="text-right tabular-nums text-primary">
                  {grandPayable === null ? (
                    <span className="text-muted-foreground text-xs">未完成驗收</span>
                  ) : (
                    formatCurrency(grandPayable)
                  )}
                </TableCell>
                <TableCell className="pr-4" />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
