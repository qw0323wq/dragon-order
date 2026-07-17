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
import { Scale, ShoppingCart, Receipt, PackageX } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { DeltaBadge } from '@/components/ui/delta-badge'
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
  // DeltaBadge 要「有號」百分比（負 = 應付低於訂購 = 短收）
  const diffPct = orderedTotal > 0 ? (totalDiff / orderedTotal) * 100 : 0
  const allReceived = receivedCount === details.length

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Scale className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">驗收差異摘要</span>
          {!allReceived && (
            <span className="text-xs text-muted-foreground">
              （已驗收 {receivedCount}/{details.length} 項，僅比對已驗收部分）
            </span>
          )}
        </div>

        {/* 訂購 vs 應付 vs 差異品項數 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="訂購金額"
            value={formatCurrency(orderedTotal)}
            icon={ShoppingCart}
            accent="bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
            hint="按訂購量 × 單價"
          />
          <StatCard
            label="應付金額"
            value={<span className="text-primary">{formatCurrency(payableTotal)}</span>}
            icon={Receipt}
            accent="bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
            /*
              invert：短收（應付 < 訂購）要顯示紅色警示，與下方差異表的紅色一致。
              預設的「漲紅跌綠」會把短收畫成綠色（像是省到錢），語意相反。
            */
            trend={
              <DeltaBadge
                percent={Number(diffPct)}
                amount={totalDiff !== 0 ? formatCurrency(totalDiff) : undefined}
                invert
              />
            }
            hint={totalDiff === 0 ? '與訂購金額相符' : '按實收 − 退貨'}
          />
          <StatCard
            label="差異品項"
            value={
              <span className={diffRows.length > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}>
                {diffRows.length} 項
              </span>
            }
            icon={PackageX}
            accent={
              diffRows.length > 0
                ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400'
                : 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400'
            }
            hint={diffRows.length > 0 ? '需要跟供應商確認' : '全部如數到貨'}
          />
        </div>

        {/* 差異明細：只列有差異的品項（無差異時由上方「差異品項」卡片交代，不再重複一行綠字） */}
        {diffRows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
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
                  <TableRow key={r.id} className="hover:bg-muted/30">
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
                        r.qtyDiff < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-orange-600 dark:text-orange-400'
                      }`}
                    >
                      {r.qtyDiff > 0 ? '+' : ''}
                      {r.qtyDiff}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-semibold ${
                        r.amountImpact < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-orange-600 dark:text-orange-400'
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
