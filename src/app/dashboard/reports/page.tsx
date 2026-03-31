'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Loader2, TrendingDown, TrendingUp, AlertTriangle, Star,
  ShoppingCart, BarChart3, ArrowUpDown, Award, Building2, ArrowRightLeft,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ── B2 消耗報表 ──
interface ConsumptionItem {
  itemId: number; itemName: string; category: string; unit: string
  theoreticalQty: number; actualQty: number; diff: number; wasteRate: number | null
}
interface ConsumptionData {
  items: ConsumptionItem[]
  summary: { totalItems: number; avgWasteRate: number; highWaste: number }
}

// ── B3 叫貨建議 ──
interface SuggestionItem {
  itemId: number; name: string; category: string; unit: string
  currentStock: number; safetyStock: number; suggestedQty: number; estimatedCost: number
}
interface SupplierSuggestion {
  supplierId: number; supplierName: string; items: SuggestionItem[]; totalCost: number
}
interface SuggestionData {
  suppliers: SupplierSuggestion[]
  summary: { totalSuppliers: number; totalItems: number; totalEstimatedCost: number }
}

// ── B4 歷史比較 ──
interface ComparisonItem {
  itemId: number; name: string; category: string; unit: string; supplier: string
  period1Qty: number; period2Qty: number; diff: number; changeRate: number; isAnomaly: boolean
}
interface ComparisonData {
  period1: { from: string; to: string }
  period2: { from: string; to: string }
  items: ComparisonItem[]
  summary: { totalItems: number; anomalies: number; increased: number; decreased: number }
}

// ── B5 供應商評分 ──
interface SupplierScore {
  supplierId: number; supplierName: string; supplierCategory: string
  totalPOs: number; completedPOs: number; totalReceiving: number
  scores: { quality: number; delivery: number; completion: number; overall: number }
  issues: { qualityIssues: number; shortages: number; missing: number }
  payment: { totalPaid: number; paidCount: number }
}
interface ScoreData {
  suppliers: SupplierScore[]
  summary: { totalSuppliers: number; avgScore: number; lowScore: number }
}

// ── C3 調撥對帳 ──
interface SettlementPair {
  fromStoreName: string; toStoreName: string; totalAmount: number; totalReturned: number
  items: Array<{ transferNumber: string; itemName: string; quantity: number; returnedQty: number; netQty: number; amount: number }>
}
interface SettlementEntry { store1: string; store2: string; net: number; direction: string }
interface SettlementData {
  month: string; pairs: SettlementPair[]; settlement: SettlementEntry[]
  summary: { totalTransfers: number; totalAmount: number }
}

// ── C4 集團報表 ──
interface GroupData {
  period: { from: string; to: string }
  storeSpending: Array<{ store_name: string; order_count: number; total_amount: number; percentage: number }>
  topItems: Array<{ name: string; category: string; supplier_name: string; total_qty: number; total_amount: number }>
  categoryCost: Array<{ category: string; total_amount: number; percentage: number }>
  supplierSpending: Array<{ name: string; total_amount: number; order_count: number }>
  summary: { grandTotal: number; storeCount: number; totalOrders: number }
}

type TabKey = 'suggestions' | 'consumption' | 'comparison' | 'scores' | 'settlement' | 'group'

const TABS: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
  { key: 'suggestions', label: '叫貨建議', icon: ShoppingCart },
  { key: 'consumption', label: '消耗報表', icon: BarChart3 },
  { key: 'comparison', label: '歷史比較', icon: ArrowUpDown },
  { key: 'scores', label: '供應商評分', icon: Award },
  { key: 'settlement', label: '調撥對帳', icon: ArrowRightLeft },
  { key: 'group', label: '集團報表', icon: Building2 },
]

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('suggestions')
  const [loading, setLoading] = useState(false)

  // B2
  const [consumption, setConsumption] = useState<ConsumptionData | null>(null)
  // B3
  const [suggestions, setSuggestions] = useState<SuggestionData | null>(null)
  // B4
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  // B5
  const [scores, setScores] = useState<ScoreData | null>(null)
  // C3
  const [settlement, setSettlement] = useState<SettlementData | null>(null)
  // C4
  const [group, setGroup] = useState<GroupData | null>(null)

  const fetchTab = useCallback(async (t: TabKey) => {
    setLoading(true)
    try {
      let res: Response
      switch (t) {
        case 'consumption':
          res = await fetch('/api/reports/consumption')
          if (res.ok) setConsumption(await res.json())
          break
        case 'suggestions':
          res = await fetch('/api/reorder-suggestions')
          if (res.ok) setSuggestions(await res.json())
          break
        case 'comparison':
          res = await fetch('/api/reports/order-comparison')
          if (res.ok) setComparison(await res.json())
          break
        case 'scores':
          res = await fetch('/api/reports/supplier-score')
          if (res.ok) setScores(await res.json())
          break
        case 'settlement':
          res = await fetch('/api/reports/transfer-settlement')
          if (res.ok) setSettlement(await res.json())
          break
        case 'group':
          res = await fetch('/api/reports/group-summary')
          if (res.ok) setGroup(await res.json())
          break
      }
    } catch { toast.error('載入失敗') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTab(tab) }, [tab, fetchTab])

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">
      <h2 className="font-heading text-lg font-semibold">營運報表</h2>

      {/* Tab 切換 */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5',
                tab === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 載入中...
        </div>
      ) : (
        <>
          {/* B3 叫貨建議 */}
          {tab === 'suggestions' && suggestions && (
            <div className="space-y-4">
              {/* 摘要卡片 */}
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-foreground">{suggestions.summary.totalItems}</div>
                  <div className="text-xs text-muted-foreground">需補貨品項</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-foreground">{suggestions.summary.totalSuppliers}</div>
                  <div className="text-xs text-muted-foreground">涉及供應商</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-foreground">${suggestions.summary.totalEstimatedCost.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">預估金額</div>
                </CardContent></Card>
              </div>

              {suggestions.suppliers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">所有品項庫存充足，不需要補貨</div>
              ) : (
                suggestions.suppliers.map(group => (
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
                              <span className="text-red-600">庫存 {item.currentStock}</span>
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
          )}

          {/* B2 消耗報表 */}
          {tab === 'consumption' && consumption && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold">{consumption.summary.totalItems}</div>
                  <div className="text-xs text-muted-foreground">有消耗的品項</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold">{consumption.summary.avgWasteRate}%</div>
                  <div className="text-xs text-muted-foreground">平均損耗率</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className={cn('text-2xl font-bold', consumption.summary.highWaste > 0 ? 'text-red-600' : 'text-green-600')}>
                    {consumption.summary.highWaste}
                  </div>
                  <div className="text-xs text-muted-foreground">高損耗品項(&gt;10%)</div>
                </CardContent></Card>
              </div>

              {consumption.items.length === 0 ? (
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
                          {consumption.items.map(item => (
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
          )}

          {/* B4 歷史比較 */}
          {tab === 'comparison' && comparison && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                比較：{comparison.period1.from} ~ {comparison.period1.to} vs {comparison.period2.from} ~ {comparison.period2.to}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold">{comparison.summary.totalItems}</div>
                  <div className="text-xs text-muted-foreground">品項</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className={cn('text-2xl font-bold', comparison.summary.anomalies > 0 ? 'text-red-600' : 'text-green-600')}>
                    {comparison.summary.anomalies}
                  </div>
                  <div className="text-xs text-muted-foreground">異常品項</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{comparison.summary.increased}</div>
                  <div className="text-xs text-muted-foreground">增加</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{comparison.summary.decreased}</div>
                  <div className="text-xs text-muted-foreground">減少</div>
                </CardContent></Card>
              </div>

              {comparison.items.length === 0 ? (
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
                          {comparison.items.map(item => (
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
          )}

          {/* B5 供應商評分 */}
          {tab === 'scores' && scores && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold">{scores.summary.totalSuppliers}</div>
                  <div className="text-xs text-muted-foreground">有交易的供應商</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold">{scores.summary.avgScore}</div>
                  <div className="text-xs text-muted-foreground">平均評分</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className={cn('text-2xl font-bold', scores.summary.lowScore > 0 ? 'text-red-600' : 'text-green-600')}>
                    {scores.summary.lowScore}
                  </div>
                  <div className="text-xs text-muted-foreground">低評分(&lt;70)</div>
                </CardContent></Card>
              </div>

              {scores.suppliers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">此期間沒有叫貨單紀錄（需要有 PO + 驗收資料）</div>
              ) : (
                <div className="space-y-2">
                  {scores.suppliers.map(s => (
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
          )}

          {/* C3 調撥對帳 */}
          {tab === 'settlement' && settlement && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">{settlement.month} 月份調撥結算</div>

              {/* 淨結算摘要 */}
              {settlement.settlement.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">結算摘要</h3>
                  {settlement.settlement.map((s, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4 pb-3 flex items-center justify-between">
                        <div>
                          <span className="font-medium">{s.store1}</span>
                          <span className="mx-2 text-muted-foreground">↔</span>
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

              {/* 明細 */}
              {settlement.pairs.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">調撥明細</h3>
                  {settlement.pairs.map((pair, i) => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          {pair.fromStoreName} → {pair.toStoreName}
                          <Badge variant="outline" className="ml-2 text-xs">${pair.totalAmount.toLocaleString()}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="divide-y text-xs">
                          {pair.items.map((item, j) => (
                            <div key={j} className="flex justify-between py-1">
                              <span>{item.transferNumber} · {item.itemName} ×{item.quantity}</span>
                              <span className="tabular-nums">
                                {item.returnedQty > 0 && <span className="text-green-600 mr-1">還{item.returnedQty}</span>}
                                淨{item.netQty} · ${item.amount}
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
          )}

          {/* C4 集團報表 */}
          {tab === 'group' && group && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">{group.period.from} ~ {group.period.to}</div>

              {/* 總覽 */}
              <div className="grid grid-cols-3 gap-3">
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold">${group.summary.grandTotal.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">總採購金額</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold">{group.summary.totalOrders}</div>
                  <div className="text-xs text-muted-foreground">訂單數</div>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold">{group.summary.storeCount}</div>
                  <div className="text-xs text-muted-foreground">門市數</div>
                </CardContent></Card>
              </div>

              {/* 各店採購金額 */}
              {group.storeSpending.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">各店採購金額</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {group.storeSpending.map((s, i) => (
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

              {/* 分類成本佔比 */}
              {group.categoryCost.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">分類成本佔比</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1.5">
                      {group.categoryCost.map((c, i) => (
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

              {/* TOP 品項 */}
              {group.topItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">採購金額 TOP 20</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="divide-y text-sm">
                      {group.topItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5">
                          <div>
                            <span className="font-medium">{item.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">{item.category} · {item.supplier_name}</span>
                          </div>
                          <span className="tabular-nums font-semibold">${(item.total_amount as number).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 供應商排名 */}
              {group.supplierSpending.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">供應商採購金額排名</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="divide-y text-sm">
                      {group.supplierSpending.map((s, i) => (
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

              {group.summary.grandTotal === 0 && (
                <div className="text-center py-8 text-muted-foreground">此期間沒有採購紀錄</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
