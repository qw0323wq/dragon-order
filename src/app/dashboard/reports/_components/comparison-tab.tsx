import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ComparisonData } from './types'

export function ComparisonTab({ data }: { data: ComparisonData }) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        比較：{data.period1.from} ~ {data.period1.to} vs {data.period2.from} ~ {data.period2.to}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.summary.totalItems}</div>
          <div className="text-xs text-muted-foreground">品項</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className={cn('text-2xl font-bold', data.summary.anomalies > 0 ? 'text-red-600' : 'text-green-600')}>
            {data.summary.anomalies}
          </div>
          <div className="text-xs text-muted-foreground">異常品項</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-green-600">{data.summary.increased}</div>
          <div className="text-xs text-muted-foreground">增加</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-red-600">{data.summary.decreased}</div>
          <div className="text-xs text-muted-foreground">減少</div>
        </CardContent></Card>
      </div>

      {data.items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">此期間沒有叫貨紀錄</div>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-2 font-normal">品項</th>
                    <th className="text-left py-2 font-normal">供應商</th>
                    <th className="text-right py-2 font-normal">上期</th>
                    <th className="text-right py-2 font-normal">本期</th>
                    <th className="text-right py-2 font-normal">變動</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => (
                    <tr key={item.itemId} className={cn('border-b border-border/50', item.isAnomaly && 'bg-yellow-50/50')}>
                      <td className="py-1.5">
                        <span className="font-medium">{item.name}</span>
                        {item.isAnomaly && <AlertTriangle className="size-3 inline ml-1 text-yellow-600" />}
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">{item.supplier}</td>
                      <td className="text-right py-1.5 tabular-nums">{item.period1Qty} {item.unit}</td>
                      <td className="text-right py-1.5 tabular-nums">{item.period2Qty} {item.unit}</td>
                      <td className={cn('text-right py-1.5 tabular-nums font-medium',
                        item.changeRate > 0 ? 'text-green-600' : item.changeRate < 0 ? 'text-red-600' : '')}>
                        {item.changeRate > 0 ? '+' : ''}{item.changeRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
