import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { SettlementData } from './types'

export function SettlementTab({ data }: { data: SettlementData }) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">{data.month} 月份調撥結算</div>

      {data.settlement.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">結算摘要</h3>
          {data.settlement.map((s, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3 flex items-center justify-between">
                <div>
                  <span className="font-medium">{s.store1}</span>
                  <span className="mx-2 text-muted-foreground">&#8596;</span>
                  <span className="font-medium">{s.store2}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">${s.net.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{s.direction}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">本月沒有門市間調撥紀錄</div>
      )}

      {data.pairs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">調撥明細</h3>
          {data.pairs.map((pair, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {pair.fromStoreName} &rarr; {pair.toStoreName}
                  <Badge variant="outline" className="ml-2 text-xs">${pair.totalAmount.toLocaleString()}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y text-xs">
                  {pair.items.map((item, j) => (
                    <div key={j} className="flex justify-between py-1">
                      <span>{item.transferNumber} &middot; {item.itemName} &times;{item.quantity}</span>
                      <span className="tabular-nums">
                        {item.returnedQty > 0 && <span className="text-green-600 mr-1">還{item.returnedQty}</span>}
                        淨{item.netQty} &middot; ${item.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
