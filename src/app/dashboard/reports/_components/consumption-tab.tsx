import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ConsumptionData } from './types'

export function ConsumptionTab({ data }: { data: ConsumptionData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.summary.totalItems}</div>
          <div className="text-xs text-muted-foreground">有消耗的品項</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.summary.avgWasteRate}%</div>
          <div className="text-xs text-muted-foreground">平均損耗率</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className={cn('text-2xl font-bold', data.summary.highWaste > 0 ? 'text-red-600' : 'text-green-600')}>
            {data.summary.highWaste}
          </div>
          <div className="text-xs text-muted-foreground">高損耗品項(&gt;10%)</div>
        </CardContent></Card>
      </div>

      {data.items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">此期間沒有消耗資料（需要有訂單 + BOM 配方 + 庫存出貨紀錄）</div>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-2 font-normal">品項</th>
                    <th className="text-right py-2 font-normal">理論消耗</th>
                    <th className="text-right py-2 font-normal">實際消耗</th>
                    <th className="text-right py-2 font-normal">差異</th>
                    <th className="text-right py-2 font-normal">損耗率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => (
                    <tr key={item.itemId} className={cn('border-b border-border/50', item.wasteRate !== null && item.wasteRate > 10 && 'bg-red-50/50')}>
                      <td className="py-1.5">
                        <span className="font-medium">{item.itemName}</span>
                        <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                      </td>
                      <td className="text-right py-1.5 tabular-nums">{item.theoreticalQty}</td>
                      <td className="text-right py-1.5 tabular-nums">{item.actualQty}</td>
                      <td className={cn('text-right py-1.5 tabular-nums', item.diff > 0 ? 'text-red-600' : item.diff < 0 ? 'text-green-600' : '')}>
                        {item.diff > 0 ? '+' : ''}{item.diff}
                      </td>
                      <td className={cn('text-right py-1.5 font-medium', item.wasteRate !== null && item.wasteRate > 10 ? 'text-red-600' : item.wasteRate !== null && item.wasteRate > 5 ? 'text-yellow-600' : 'text-green-600')}>
                        {item.wasteRate !== null ? `${item.wasteRate}%` : '—'}
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
