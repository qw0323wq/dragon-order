'use client'

/**
 * 報表中心 — Tab 切換 + Lazy 載入 + 快取
 *
 * P2-C10 優化：
 * - 已載入的 tab 切回不重新 fetch（in-memory cache）
 * - loading 只對「首次載入」顯示，切回已載的不閃
 * - 加手動刷新按鈕（避免資料過時）
 * - Skeleton 取代 spinner
 */
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Loader2, ShoppingCart, BarChart3, ArrowUpDown, Award, Building2, ArrowRightLeft, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SkeletonTable } from '@/components/ui/skeleton'

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

const ENDPOINTS: Record<TabKey, string> = {
  consumption: '/api/reports/consumption',
  suggestions: '/api/reorder-suggestions',
  comparison: '/api/reports/order-comparison',
  scores: '/api/reports/supplier-score',
  settlement: '/api/reports/transfer-settlement',
  group: '/api/reports/group-summary',
}

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('suggestions')
  const [loadingTab, setLoadingTab] = useState<TabKey | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [consumption, setConsumption] = useState<ConsumptionData | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionData | null>(null)
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [scores, setScores] = useState<ScoreData | null>(null)
  const [settlement, setSettlement] = useState<SettlementData | null>(null)
  const [group, setGroup] = useState<GroupData | null>(null)

  // 判斷當前 tab 的資料是否已載入
  function currentData(t: TabKey) {
    switch (t) {
      case 'suggestions': return suggestions
      case 'consumption': return consumption
      case 'comparison': return comparison
      case 'scores': return scores
      case 'settlement': return settlement
      case 'group': return group
    }
  }

  const fetchTab = useCallback(
    async (t: TabKey, options: { force?: boolean; silent?: boolean } = {}) => {
      if (!options.silent) setLoadingTab(t)
      try {
        const res = await fetch(ENDPOINTS[t])
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
        } else {
          toast.error('載入失敗')
        }
      } catch {
        toast.error('載入失敗')
      } finally {
        if (!options.silent) setLoadingTab(null)
      }
    },
    []
  )

  // Tab 切換時：已載入過的直接顯示，未載入的才 fetch
  useEffect(() => {
    if (!currentData(tab)) {
      fetchTab(tab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchTab(tab, { force: true, silent: true })
    setRefreshing(false)
    toast.success('已刷新')
  }

  const data = currentData(tab)
  const isFirstLoading = loadingTab === tab && !data

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">營運報表</h2>
        {data && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={refreshing}
            onClick={handleRefresh}
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
            刷新
          </Button>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = tab === t.key
          const hasLoaded = !!currentData(t.key)
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              title={hasLoaded && !isActive ? '已載入（切回不重撈）' : undefined}
            >
              <Icon className="size-3.5" />
              {t.label}
              {hasLoaded && !isActive && (
                <span className="size-1.5 rounded-full bg-green-500" aria-label="已載入" />
              )}
            </button>
          )
        })}
      </div>

      {isFirstLoading ? (
        <SkeletonTable rows={8} cols={5} />
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
