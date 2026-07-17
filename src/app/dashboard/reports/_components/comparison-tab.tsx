import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, ArrowLeftRight, Package, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { DeltaBadge } from '@/components/ui/delta-badge'
import { StatCard } from '@/components/ui/stat-card'
import type { ComparisonData } from './types'

/** 樞紐表：表頭儲存格共用樣式 */
const TH = 'px-2 py-2 font-normal whitespace-nowrap'

export function ComparisonTab({ data }: { data: ComparisonData }) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground tabular-nums">
        比較：{data.period1.from} ~ {data.period1.to} vs {data.period2.from} ~ {data.period2.to}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="品項"
          value={data.summary.totalItems}
          icon={Package}
          accent="bg-blue-100 text-blue-600"
          hint="納入比較"
        />
        <StatCard
          label="異常品項"
          value={
            <span className={data.summary.anomalies > 0 ? 'text-red-600' : 'text-green-600'}>
              {data.summary.anomalies}
            </span>
          }
          icon={AlertTriangle}
          accent={data.summary.anomalies > 0 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}
          hint="變動幅度過大"
        />
        <StatCard
          label="增加"
          value={<span className="text-red-600">{data.summary.increased}</span>}
          icon={TrendingUp}
          accent="bg-red-100 text-red-600"
          hint="本期用量上升"
        />
        <StatCard
          label="減少"
          value={<span className="text-green-600">{data.summary.decreased}</span>}
          icon={TrendingDown}
          accent="bg-green-100 text-green-600"
          hint="本期用量下降"
        />
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="此期間沒有叫貨紀錄"
          description="選擇有叫貨資料的兩個期間，即可比較各品項的採購量變化。"
        />
      ) : (
        <Card>
          <CardContent className="px-2 sm:px-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th rowSpan={2} className={cn(TH, 'w-full rounded-l-lg text-left align-bottom')}>
                      品項
                    </th>
                    <th rowSpan={2} className={cn(TH, 'text-left align-bottom')}>
                      供應商
                    </th>
                    <th colSpan={2} className={cn(TH, 'border-b border-border/60 py-1.5 text-center')}>
                      數量
                    </th>
                    <th rowSpan={2} className={cn(TH, 'rounded-r-lg text-right align-bottom')}>
                      變動
                    </th>
                  </tr>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th className={cn(TH, 'py-1.5 text-right')}>上期</th>
                    <th className={cn(TH, 'py-1.5 text-right')}>本期</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => {
                    const diff = Number(item.diff)
                    return (
                      <tr
                        key={item.itemId}
                        className={cn(
                          'border-b border-border/50 transition-colors hover:bg-muted/30',
                          item.isAnomaly && 'bg-yellow-50/60 hover:bg-yellow-50',
                        )}
                      >
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className="font-medium">{item.name}</span>
                          <span className="ml-1 text-xs text-muted-foreground">{item.unit}</span>
                          {item.isAnomaly && <AlertTriangle className="ml-1 inline size-3 text-yellow-600" />}
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {item.supplier}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {item.period1Qty}
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums">{item.period2Qty}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          <DeltaBadge
                            percent={Number(item.changeRate)}
                            amount={`${diff > 0 ? '+' : ''}${diff}`}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
