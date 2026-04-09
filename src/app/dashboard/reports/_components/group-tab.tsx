import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GroupData } from './types'

export function GroupTab({ data }: { data: GroupData }) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">{data.period.from} ~ {data.period.to}</div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">${data.summary.grandTotal.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">總採購金額</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.summary.totalOrders}</div>
          <div className="text-xs text-muted-foreground">訂單數</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.summary.storeCount}</div>
          <div className="text-xs text-muted-foreground">門市數</div>
        </CardContent></Card>
      </div>

      {data.storeSpending.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">各店採購金額</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {data.storeSpending.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm font-medium w-20 shrink-0">{s.store_name}</span>
                  <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${Math.min(s.percentage, 100)}%` }} />
                  </div>
                  <span className="text-sm tabular-nums font-semibold w-24 text-right">
                    ${(s.total_amount as number).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground w-12 text-right">{s.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.categoryCost.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">分類成本佔比</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {data.categoryCost.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{c.category}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">${(c.total_amount as number).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">{c.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.topItems.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">採購金額 TOP 20</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y text-sm">
              {data.topItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground ml-1">{item.category} &middot; {item.supplier_name}</span>
                  </div>
                  <span className="tabular-nums font-semibold">${(item.total_amount as number).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.supplierSpending.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">供應商採購金額排名</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y text-sm">
              {data.supplierSpending.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="font-medium">{s.name}</span>
                  <div className="text-right">
                    <span className="tabular-nums font-semibold">${(s.total_amount as number).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground ml-2">{s.order_count}單</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.summary.grandTotal === 0 && (
        <div className="text-center py-8 text-muted-foreground">此期間沒有採購紀錄</div>
      )}
    </div>
  )
}
