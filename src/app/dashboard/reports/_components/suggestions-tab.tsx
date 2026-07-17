import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PackageCheck } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import type { SuggestionData } from './types'

export function SuggestionsTab({ data }: { data: SuggestionData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-foreground">{data.summary.totalItems}</div>
          <div className="text-xs text-muted-foreground">需補貨品項</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-foreground">{data.summary.totalSuppliers}</div>
          <div className="text-xs text-muted-foreground">涉及供應商</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-foreground">${data.summary.totalEstimatedCost.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">預估金額</div>
        </CardContent></Card>
      </div>

      {data.suppliers.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="所有品項庫存充足"
          description="目前沒有低於安全庫存的品項，暫時不需要補貨。"
        />
      ) : (
        data.suppliers.map(group => (
          <Card key={group.supplierId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>{group.supplierName}</span>
                <Badge variant="outline" className="text-xs">
                  {group.items.length} 項 · 約 ${group.totalCost.toLocaleString()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y text-sm">
                {group.items.map(item => (
                  <div key={item.itemId} className="flex items-center justify-between py-1.5">
                    <div>
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">{item.category}</span>
                    </div>
                    <div className="text-right text-xs">
                      <span className="text-red-600 dark:text-red-400">庫存 {item.currentStock}</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span>安全 {item.safetyStock}</span>
                      <span className="ml-2 font-semibold text-primary">建議叫 {item.suggestedQty} {item.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
