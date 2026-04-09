'use client'

/**
 * 報表中心 — Tab 切換 + Lazy 載入各報表元件
 *
 * 各 tab 的渲染邏輯已拆分到 _components/ 下
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, ShoppingCart, BarChart3, ArrowUpDown, Award, Building2, ArrowRightLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

import type {
  TabKey, ConsumptionData, SuggestionData, ComparisonData,
  ScoreData, SettlementData, GroupData,
} from './_components/types'
import { SuggestionsTab } from './_components/suggestions-tab'
import { ConsumptionTab } from './_components/consumption-tab'
import { ComparisonTab } from './_components/comparison-tab'
import { ScoresTab } from './_components/scores-tab'
import { SettlementTab } from './_components/settlement-tab'
import { GroupTab } from './_components/group-tab'

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

  const [consumption, setConsumption] = useState<ConsumptionData | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionData | null>(null)
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [scores, setScores] = useState<ScoreData | null>(null)
  const [settlement, setSettlement] = useState<SettlementData | null>(null)
  const [group, setGroup] = useState<GroupData | null>(null)

  const fetchTab = useCallback(async (t: TabKey) => {
    setLoading(true)
    try {
      const endpoints: Record<TabKey, string> = {
        consumption: '/api/reports/consumption',
        suggestions: '/api/reorder-suggestions',
        comparison: '/api/reports/order-comparison',
        scores: '/api/reports/supplier-score',
        settlement: '/api/reports/transfer-settlement',
        group: '/api/reports/group-summary',
      }
      const res = await fetch(endpoints[t])
      if (res.ok) {
        const data = await res.json()
        switch (t) {
          case 'consumption': setConsumption(data); break
          case 'suggestions': setSuggestions(data); break
          case 'comparison': setComparison(data); break
          case 'scores': setScores(data); break
          case 'settlement': setSettlement(data); break
          case 'group': setGroup(data); break
        }
      }
    } catch { toast.error('載入失敗') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTab(tab) }, [tab, fetchTab])

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">
      <h2 className="font-heading text-lg font-semibold">營運報表</h2>

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
          {tab === 'suggestions' && suggestions && <SuggestionsTab data={suggestions} />}
          {tab === 'consumption' && consumption && <ConsumptionTab data={consumption} />}
          {tab === 'comparison' && comparison && <ComparisonTab data={comparison} />}
          {tab === 'scores' && scores && <ScoresTab data={scores} />}
          {tab === 'settlement' && settlement && <SettlementTab data={settlement} />}
          {tab === 'group' && group && <GroupTab data={group} />}
        </>
      )}
    </div>
  )
}
