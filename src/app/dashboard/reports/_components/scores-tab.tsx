import { Card, CardContent } from '@/components/ui/card'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScoreData } from './types'

export function ScoresTab({ data }: { data: ScoreData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.summary.totalSuppliers}</div>
          <div className="text-xs text-muted-foreground">有交易的供應商</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{data.summary.avgScore}</div>
          <div className="text-xs text-muted-foreground">平均評分</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className={cn('text-2xl font-bold', data.summary.lowScore > 0 ? 'text-red-600' : 'text-green-600')}>
            {data.summary.lowScore}
          </div>
          <div className="text-xs text-muted-foreground">低評分(&lt;70)</div>
        </CardContent></Card>
      </div>

      {data.suppliers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">此期間沒有叫貨單紀錄（需要有 PO + 驗收資料）</div>
      ) : (
        <div className="space-y-2">
          {data.suppliers.map(s => (
            <Card key={s.supplierId}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium">{s.supplierName}</span>
                    <span className="text-xs text-muted-foreground ml-1">{s.supplierCategory}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className={cn('size-4', s.scores.overall >= 80 ? 'text-yellow-500 fill-yellow-500' : s.scores.overall >= 60 ? 'text-yellow-500' : 'text-muted-foreground')} />
                    <span className={cn('text-lg font-bold', s.scores.overall >= 80 ? 'text-green-600' : s.scores.overall >= 60 ? 'text-yellow-600' : 'text-red-600')}>
                      {s.scores.overall}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-muted/50 rounded px-2 py-1.5 text-center">
                    <div className="font-semibold">{s.scores.quality}%</div>
                    <div className="text-muted-foreground">品質</div>
                  </div>
                  <div className="bg-muted/50 rounded px-2 py-1.5 text-center">
                    <div className="font-semibold">{s.scores.delivery}%</div>
                    <div className="text-muted-foreground">交貨</div>
                  </div>
                  <div className="bg-muted/50 rounded px-2 py-1.5 text-center">
                    <div className="font-semibold">{s.scores.completion}%</div>
                    <div className="text-muted-foreground">完成率</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{s.totalPOs} 筆 PO</span>
                  <span>{s.totalReceiving} 筆驗收</span>
                  {s.issues.qualityIssues > 0 && <span className="text-red-600">{s.issues.qualityIssues} 品質問題</span>}
                  {s.issues.shortages > 0 && <span className="text-yellow-600">{s.issues.shortages} 短缺</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
