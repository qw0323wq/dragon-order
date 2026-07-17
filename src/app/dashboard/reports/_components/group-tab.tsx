import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, ClipboardList, Store, Wallet } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { formatCurrency, sumBy } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { GroupData } from './types'

/** 樞紐表：表頭儲存格共用樣式 */
const TH = 'px-2 py-2 font-normal whitespace-nowrap'
/** 樞紐表：資料列（hover 高亮） */
const ROW = 'border-b border-border/50 transition-colors hover:bg-muted/30'
/** 樞紐表：總計列（粗上框 + 底色強調） */
const TOTAL_ROW = 'border-t-2 border-foreground/15 bg-muted/40 font-semibold'

/** 佔比顯示 — 一律一位小數，避免 12% / 12.34% 混排破壞對齊 */
function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

/** 樞紐表外框 — 窄螢幕可橫向捲動，不爆版 */
function PivotTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

/**
 * 樞紐表金額格 — 主數字（千分位）+ 底下的佔比 %，整欄右對齊。
 * 全表統一用它，確保金額與佔比的欄位對齊一致。
 */
function AmountCell({ amount, share, strong = false }: { amount: number; share: number; strong?: boolean }) {
  return (
    <td className="px-2 py-2 text-right whitespace-nowrap">
      <div className={cn('tabular-nums', strong ? 'font-semibold' : 'font-medium')}>
        {formatCurrency(amount)}
      </div>
      <div className="text-xs tabular-nums text-muted-foreground">{pct(share)}</div>
    </td>
  )
}

export function GroupTab({ data }: { data: GroupData }) {
  // 以下皆為「顯示用」聚合：把畫面上已列出的欄位加總成總計列，不改動任何後端計算
  const grandTotal = Number(data.summary.grandTotal)
  /** 佔總採購額比例（grandTotal 為 0 時不做除法） */
  const shareOf = (amount: number) => (grandTotal > 0 ? (amount / grandTotal) * 100 : 0)

  const storeTotal = sumBy(data.storeSpending, s => Number(s.total_amount))
  const storeShareTotal = sumBy(data.storeSpending, s => Number(s.percentage))
  const categoryTotal = sumBy(data.categoryCost, c => Number(c.total_amount))
  const categoryShareTotal = sumBy(data.categoryCost, c => Number(c.percentage))
  const topItemsTotal = sumBy(data.topItems, i => Number(i.total_amount))
  const supplierTotal = sumBy(data.supplierSpending, s => Number(s.total_amount))
  const supplierOrderTotal = data.supplierSpending.reduce((sum, s) => sum + Number(s.order_count), 0)

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground tabular-nums">
        {data.period.from} ~ {data.period.to}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          className="col-span-2 sm:col-span-1"
          label="總採購金額"
          value={formatCurrency(grandTotal)}
          icon={Wallet}
          accent="bg-red-100 text-red-600"
          hint="本期間合計"
        />
        <StatCard
          label="訂單數"
          value={data.summary.totalOrders}
          icon={ClipboardList}
          accent="bg-orange-100 text-orange-600"
        />
        <StatCard
          label="門市數"
          value={data.summary.storeCount}
          icon={Store}
          accent="bg-blue-100 text-blue-600"
        />
      </div>

      {data.storeSpending.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">各店採購金額</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pt-0 sm:px-4">
            <PivotTable>
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className={cn(TH, 'rounded-l-lg text-left')}>門市</th>
                  <th className={cn(TH, 'w-full text-left')}>分佈</th>
                  <th className={cn(TH, 'rounded-r-lg text-right')}>採購金額</th>
                </tr>
              </thead>
              <tbody>
                {data.storeSpending.map((s, i) => {
                  const percentage = Number(s.percentage)
                  return (
                    <tr key={i} className={ROW}>
                      <td className="px-2 py-2 font-medium whitespace-nowrap">{s.store_name}</td>
                      <td className="px-2 py-2">
                        <div className="h-2 w-24 min-w-16 overflow-hidden rounded-full bg-muted sm:w-full">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </td>
                      <AmountCell amount={Number(s.total_amount)} share={percentage} />
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={TOTAL_ROW}>
                  <td className="px-2 py-2 whitespace-nowrap">總計</td>
                  <td className="px-2 py-2" />
                  <AmountCell amount={storeTotal} share={storeShareTotal} strong />
                </tr>
              </tfoot>
            </PivotTable>
          </CardContent>
        </Card>
      )}

      {data.categoryCost.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">分類成本佔比</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pt-0 sm:px-4">
            <PivotTable>
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className={cn(TH, 'w-full rounded-l-lg text-left')}>分類</th>
                  <th className={cn(TH, 'rounded-r-lg text-right')}>採購金額</th>
                </tr>
              </thead>
              <tbody>
                {data.categoryCost.map((c, i) => (
                  <tr key={i} className={ROW}>
                    <td className="px-2 py-2 whitespace-nowrap">{c.category}</td>
                    <AmountCell amount={Number(c.total_amount)} share={Number(c.percentage)} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={TOTAL_ROW}>
                  <td className="px-2 py-2 whitespace-nowrap">總計</td>
                  <AmountCell amount={categoryTotal} share={categoryShareTotal} strong />
                </tr>
              </tfoot>
            </PivotTable>
          </CardContent>
        </Card>
      )}

      {data.topItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">採購金額 TOP 20</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pt-0 sm:px-4">
            <PivotTable>
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className={cn(TH, 'rounded-l-lg text-right')}>#</th>
                  <th className={cn(TH, 'w-full text-left')}>品項</th>
                  <th className={cn(TH, 'rounded-r-lg text-right')}>採購金額</th>
                </tr>
              </thead>
              <tbody>
                {data.topItems.map((item, i) => (
                  <tr key={i} className={ROW}>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.category} &middot; {item.supplier_name}
                      </div>
                    </td>
                    <AmountCell amount={Number(item.total_amount)} share={shareOf(Number(item.total_amount))} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={TOTAL_ROW}>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 whitespace-nowrap">TOP {data.topItems.length} 小計</td>
                  <AmountCell amount={topItemsTotal} share={shareOf(topItemsTotal)} strong />
                </tr>
              </tfoot>
            </PivotTable>
          </CardContent>
        </Card>
      )}

      {data.supplierSpending.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">供應商採購金額排名</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pt-0 sm:px-4">
            <PivotTable>
              <thead>
                <tr className="bg-muted/50 text-xs text-muted-foreground">
                  <th className={cn(TH, 'w-full rounded-l-lg text-left')}>供應商</th>
                  <th className={cn(TH, 'text-right')}>訂單數</th>
                  <th className={cn(TH, 'rounded-r-lg text-right')}>採購金額</th>
                </tr>
              </thead>
              <tbody>
                {data.supplierSpending.map((s, i) => (
                  <tr key={i} className={ROW}>
                    <td className="px-2 py-2 font-medium whitespace-nowrap">{s.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {s.order_count}
                    </td>
                    <AmountCell amount={Number(s.total_amount)} share={shareOf(Number(s.total_amount))} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={TOTAL_ROW}>
                  <td className="px-2 py-2 whitespace-nowrap">總計</td>
                  <td className="px-2 py-2 text-right tabular-nums">{supplierOrderTotal}</td>
                  <AmountCell amount={supplierTotal} share={shareOf(supplierTotal)} strong />
                </tr>
              </tfoot>
            </PivotTable>
          </CardContent>
        </Card>
      )}

      {data.summary.grandTotal === 0 && (
        <EmptyState
          icon={Building2}
          title="此期間沒有採購紀錄"
          description="選擇有叫貨資料的月份，即可看到各門市的採購彙總與比較。"
        />
      )}
    </div>
  )
}
