'use client'

/**
 * 驗收差異摘要 — 訂購 vs 實收 自動比對（參考 Costflows「訂購與單據差異」）
 *
 * 回答「今天的貨到齊了沒、少了多少錢」：
 *   頂列：訂購總額 → 差異 badge（金額與 %）→ 應付總額
 *   差異表：只列有差異的品項（實收-退貨 ≠ 訂購量），含影響金額
 *
 * 資料全部來自父層 details（/api/orders/[id] 已 join receiving），純前端計算。
 * 尚無任何驗收紀錄時不渲染。
 */

import { useMemo } from 'react'
import { ArrowRight, CheckCircle2, Scale } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatCurrency, roundMoney, sumBy } from '@/lib/format'
import type { OrderDetail } from './types'

interface DiffRow {
  id: number
  itemName: string
  storeName: string
  unit: string
  orderedQty: number
  /** 實收 - 退貨 */
  keptQty: number
  qtyDiff: number
  /** 應付小計 - 訂購小計（負 = 少付） */
  amountImpact: number
}

interface ReceivingDiffSummaryProps {
  details: OrderDetail[]
}

export function ReceivingDiffSummary({ details }: ReceivingDiffSummaryProps) {
  const { receivedCount, orderedTotal, payableTotal, diffRows } = useMemo(() => {
    const received = details.filter(
      (d) => d.actualSubtotal !== null && d.actualSubtotal !== undefined
    )
    const rows: DiffRow[] = []
    for (const d of received) {
      const orderedQty = parseFloat(d.quantity) || 0
      const rec = parseFloat(d.receivedQty ?? '') || 0
      const ret = parseFloat(d.returnedQty ?? '0') || 0
      const keptQty = rec - ret
      const qtyDiff = roundMoney(keptQty - orderedQty)
      if (qtyDiff !== 0) {
        rows.push({
          id: d.id,
          itemName: d.itemName,
          storeName: d.storeName,
          unit: d.unit,
          orderedQty,
          keptQty,
          qtyDiff,
          amountImpact: roundMoney((d.actualSubtotal ?? 0) - d.subtotal),
        })
      }
    }
    return {
      receivedCount: received.length,
      // 訂購/應付總額只算「已驗收」品項，兩邊口徑一致才能比
      orderedTotal: sumBy(received, (d) => d.subtotal),
      payableTotal: sumBy(received, (d) => d.actualSubtotal ?? 0),
      diffRows: rows,
    }
  }, [details])

  // 完全沒驗收 → 不顯示摘要
  if (receivedCount === 0) return null

  const totalDiff = roundMoney(payableTotal - orderedTotal)
  const diffPct = orderedTotal > 0 ? Math.abs((totalDiff / orderedTotal) * 100) : 0
  const allReceived = receivedCount === details.length

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        {/* 頂列：訂購 → 差異 → 應付 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-muted-foreground" />
            <span className="font-semibold text-sm">驗收差異摘要</span>
            {!allReceived && (
              <span className="text-xs text-muted-foreground">
                （已驗收 {receivedCount}/{details.length} 項，僅比對已驗收部分）
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground">訂購金額</p>
            <p className="text-lg font-bold font-heading">{formatCurrency(orderedTotal)}</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
              totalDiff === 0
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {totalDiff === 0
              ? '無差異'
              : `${totalDiff > 0 ? '+' : ''}${formatCurrency(totalDiff)}（${diffPct.toFixed(1)}%）`}
          </span>
          <ArrowRight className="size-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">應付金額</p>
            <p className="text-lg font-bold font-heading text-primary">{formatCurrency(payableTotal)}</p>
          </div>
        </div>

        {/* 差異明細：只列有差異的品項 */}
        {diffRows.length === 0 ? (
          <div className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="size-4" />
            已驗收品項皆如數到貨
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品項</TableHead>
                  <TableHead className="hidden sm:table-cell">門市</TableHead>
                  <TableHead className="text-right">訂購量</TableHead>
                  <TableHead className="text-right">實收量</TableHead>
                  <TableHead className="text-right">差異</TableHead>
                  <TableHead className="text-right">影響金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.itemName}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                      {r.storeName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.orderedQty} {r.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.keptQty} {r.unit}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${
                        r.qtyDiff < 0 ? 'text-red-600' : 'text-orange-600'
                      }`}
                    >
                      {r.qtyDiff > 0 ? '+' : ''}
                      {r.qtyDiff}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-semibold ${
                        r.amountImpact < 0 ? 'text-red-600' : 'text-orange-600'
                      }`}
                    >
                      {r.amountImpact > 0 ? '+' : ''}
                      {formatCurrency(r.amountImpact)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
