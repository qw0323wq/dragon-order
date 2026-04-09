'use client'

/**
 * iCHEF POS 資料匯入頁面
 *
 * 功能：
 *  1. 拖拉 / 點選上傳多個 .xlsx 檔案
 *  2. 瀏覽器端直接解析（不上傳 Server）
 *  3. 自動判斷類型：item-overview / category-overview / checkout
 *  4. item-overview 自動比對系統品項（alias 匹配），顯示毛利
 *  5. 手機響應式
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  CircleDashed,
  TrendingUp,
  ShoppingCart,
  CreditCard,
  AlertCircle,
  BarChart3,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  parsePosFile,
  matchPosItem,
  type PosParseResult,
  type ItemOverviewRow,
} from '@/lib/pos-parser'

// ── 型別 ──────────────────────────────────────────────────────────────────────

interface SystemItem {
  id: number
  name: string
  category: string
  aliases: string[]
  costPrice: number
  sellPrice: number
}

/** matchPosItem 回傳的精簡比對結果 */
interface MatchedSystemItem {
  id: number
  name: string
  costPrice: number
  sellPrice: number
}

/** 解析後附帶品項匹配結果的 item-overview 列 */
interface MatchedItemRow extends ItemOverviewRow {
  matched: MatchedSystemItem | null
  /** 估算毛利（若有匹配） */
  estimatedProfit: number | null
}

interface ParsedFile {
  id: string
  fileName: string
  result: PosParseResult
  /** item-overview 才有 */
  matchedRows?: MatchedItemRow[]
}

// ── 共用工具（從 lib/format 匯入）──
import { formatCurrency as fmtMoney } from "@/lib/format";

/** 類型中文標籤 */
const TYPE_LABEL: Record<string, string> = {
  'item-overview': '品項銷售',
  'category-overview': '分類銷售',
  checkout: '結帳紀錄',
}

/** 類型 Badge 顏色 */
function typeBadgeClass(type: string): string {
  if (type === 'item-overview') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  if (type === 'category-overview') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
  return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
}

// ── 子元件：拖拉上傳區 ────────────────────────────────────────────────────────

interface DropZoneProps {
  onFiles: (files: File[]) => void
  isLoading: boolean
}

function DropZone({ onFiles, isLoading }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.endsWith('.xlsx')
    )
    if (files.length === 0) {
      toast.error('只支援 .xlsx 格式')
      return
    }
    onFiles(files)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) onFiles(files)
    // 清除 input 讓同一個檔案可以重複選取
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      className={[
        'border-2 border-dashed rounded-xl p-8 md:p-12 text-center cursor-pointer transition-colors select-none',
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/30',
        isLoading ? 'pointer-events-none opacity-60' : '',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        multiple
        className="hidden"
        onChange={handleChange}
      />

      <div className="flex flex-col items-center gap-3">
        {isLoading ? (
          <CircleDashed className="size-10 text-muted-foreground animate-spin" />
        ) : (
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
            <Upload className="size-6 text-muted-foreground" />
          </div>
        )}
        <div>
          <p className="text-sm font-medium">
            {isLoading ? '解析中...' : '拖拉檔案到這裡，或點此選取'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            支援 iCHEF 匯出的 .xlsx（可同時上傳多個）
          </p>
          <p className="text-xs text-muted-foreground">
            品項銷售概覽 / 分類銷售概覽 / 結帳紀錄
          </p>
        </div>
      </div>
    </div>
  )
}

// ── 子元件：item-overview 表格 ────────────────────────────────────────────────

interface ItemOverviewTableProps {
  rows: MatchedItemRow[]
  summary: { totalItems: number; totalQuantity: number; totalRevenue: number }
}

function ItemOverviewTable({ rows, summary }: ItemOverviewTableProps) {
  const matchedCount = rows.filter((r) => r.matched !== null).length

  return (
    <div className="space-y-4">
      {/* 摘要卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="總品項數" value={summary.totalItems.toString()} icon={FileSpreadsheet} />
        <SummaryCard label="總銷售量" value={summary.totalQuantity.toLocaleString()} icon={ShoppingCart} />
        <SummaryCard label="總營業額" value={fmtMoney(summary.totalRevenue)} icon={TrendingUp} />
        <SummaryCard
          label="已比對品項"
          value={`${matchedCount} / ${rows.length}`}
          icon={CheckCircle2}
          valueClass={matchedCount === rows.length ? 'text-green-600' : 'text-yellow-600'}
        />
      </div>

      {/* 品項表格 */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4 w-8">排名</TableHead>
              <TableHead>品項名稱</TableHead>
              <TableHead className="hidden sm:table-cell">分類</TableHead>
              <TableHead className="text-right">銷售量</TableHead>
              <TableHead className="text-right hidden md:table-cell">點選率</TableHead>
              <TableHead className="text-right">營業額</TableHead>
              <TableHead className="hidden lg:table-cell">系統比對</TableHead>
              <TableHead className="text-right hidden lg:table-cell">估算毛利</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="pl-4 text-muted-foreground text-sm">{idx + 1}</TableCell>
                <TableCell className="font-medium max-w-[140px] truncate" title={row.name}>
                  {row.name}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {row.category || '-'}
                </TableCell>
                <TableCell className="text-right">{row.quantity.toLocaleString()}</TableCell>
                <TableCell className="text-right hidden md:table-cell text-muted-foreground text-sm">
                  {row.clickRate}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {fmtMoney(row.revenue)}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {row.matched ? (
                    <span className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      {row.matched.name}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">未匹配</span>
                  )}
                </TableCell>
                <TableCell className="text-right hidden lg:table-cell">
                  {row.estimatedProfit !== null ? (
                    <span className={row.estimatedProfit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                      {fmtMoney(row.estimatedProfit)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ── 子元件：category-overview 表格 ───────────────────────────────────────────

function CategoryOverviewTable({
  rows,
  summary,
}: {
  rows: { name: string; clickRate: string; quantity: number; quantityRate: string; revenue: number; revenueRate: string }[]
  summary: { totalCategories: number; totalQuantity: number; totalRevenue: number }
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="分類數" value={summary.totalCategories.toString()} icon={BarChart3} />
        <SummaryCard label="總銷售量" value={summary.totalQuantity.toLocaleString()} icon={ShoppingCart} />
        <SummaryCard label="總營業額" value={fmtMoney(summary.totalRevenue)} icon={TrendingUp} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">分類</TableHead>
              <TableHead className="text-right">銷售量</TableHead>
              <TableHead className="text-right hidden sm:table-cell">銷售量占比</TableHead>
              <TableHead className="text-right">營業額</TableHead>
              <TableHead className="text-right hidden sm:table-cell">營業額占比</TableHead>
              <TableHead className="text-right hidden md:table-cell">點選率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium pl-4">{row.name}</TableCell>
                <TableCell className="text-right">{row.quantity.toLocaleString()}</TableCell>
                <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
                  {row.quantityRate}
                </TableCell>
                <TableCell className="text-right font-medium">{fmtMoney(row.revenue)}</TableCell>
                <TableCell className="text-right hidden sm:table-cell text-muted-foreground">
                  {row.revenueRate}
                </TableCell>
                <TableCell className="text-right hidden md:table-cell text-muted-foreground">
                  {row.clickRate}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ── 子元件：結帳紀錄表格 ───────────────────────────────────────────────────────

function CheckoutTable({
  rows,
  summary,
}: {
  rows: { invoiceNo: string; checkoutTime: string; tableNo: string; amount: number; payMethod: string; items: string }[]
  summary: { totalOrders: number; totalRevenue: number; payMethods: Record<string, number> }
}) {
  return (
    <div className="space-y-4">
      {/* 摘要卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="總訂單數" value={summary.totalOrders.toLocaleString()} icon={ShoppingCart} />
        <SummaryCard label="總營業額" value={fmtMoney(summary.totalRevenue)} icon={TrendingUp} />
        <div className="col-span-2 md:col-span-1">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="size-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">付款方式</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(summary.payMethods).map(([method, count]) => (
                  <span
                    key={method}
                    className="inline-flex items-center gap-1 bg-muted rounded-md px-2 py-0.5 text-xs"
                  >
                    {method}
                    <span className="font-semibold">{count}</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 結帳紀錄表格 */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">結帳時間</TableHead>
              <TableHead className="hidden sm:table-cell">桌號</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead className="hidden md:table-cell">付款方式</TableHead>
              <TableHead className="hidden lg:table-cell">品項</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 200).map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="pl-4 text-sm">{row.checkoutTime || '-'}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {row.tableNo || '-'}
                </TableCell>
                <TableCell className="text-right font-medium">{fmtMoney(row.amount)}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                  {row.payMethod || '-'}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground text-sm max-w-[240px] truncate" title={row.items}>
                  {row.items || '-'}
                </TableCell>
              </TableRow>
            ))}
            {rows.length > 200 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-3">
                  顯示前 200 筆，共 {rows.length} 筆
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ── 子元件：摘要卡片 ──────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string
  value: string
  icon: React.ElementType
  valueClass?: string
}

function SummaryCard({ label, value, icon: Icon, valueClass }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={['text-lg font-bold leading-tight', valueClass ?? ''].join(' ')}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('')

  /** 系統品項（從 /api/items 取得，用於 item-overview 品項比對） */
  const [systemItems, setSystemItems] = useState<SystemItem[]>([])

  // 載入系統品項
  useEffect(() => {
    fetch('/api/items')
      .then((r) => r.json())
      .then((data: SystemItem[]) => setSystemItems(data))
      .catch(() => {
        // 載入失敗不影響解析，只是無法做品項比對
        console.warn('無法載入系統品項清單，品項比對功能停用')
      })
  }, [])

  /**
   * 處理上傳的檔案
   * CRITICAL: 全部在瀏覽器端解析，不上傳到 Server
   */
  const handleFiles = useCallback(
    async (files: File[]) => {
      setIsLoading(true)

      const results: ParsedFile[] = []

      for (const file of files) {
        try {
          const result = await parsePosFile(file)
          const id = `${file.name}-${Date.now()}-${Math.random()}`

          let matchedRows: MatchedItemRow[] | undefined

          // item-overview：做品項比對
          if (result.type === 'item-overview') {
            matchedRows = result.rows.map((row) => {
              const matched = systemItems.length > 0
                ? matchPosItem(row.name, systemItems)
                : null

              // 估算毛利 = 銷售量 × (售價 - 進貨成本)
              // 若沒有 avgPrice 就用 matched.sellPrice
              const estimatedProfit =
                matched !== null
                  ? row.quantity * (matched.sellPrice - matched.costPrice)
                  : null

              return { ...row, matched, estimatedProfit }
            })
          }

          results.push({ id, fileName: file.name, result, matchedRows })
          toast.success(`${file.name} 解析完成（${TYPE_LABEL[result.type]}，${getRowCount(result)} 筆）`)
        } catch (err) {
          toast.error(`${file.name} 解析失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
        }
      }

      if (results.length > 0) {
        setParsedFiles((prev) => {
          const updated = [...prev, ...results]
          // 預設選中第一個新加的 tab
          if (!prev.length) setActiveTab(results[0].id)
          return updated
        })
      }

      setIsLoading(false)
    },
    [systemItems]
  )

  /** 移除已解析的檔案 */
  function removeFile(id: string) {
    setParsedFiles((prev) => {
      const updated = prev.filter((f) => f.id !== id)
      if (activeTab === id && updated.length > 0) setActiveTab(updated[0].id)
      return updated
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 頁面標題 */}
      <div>
        <h2 className="font-heading text-xl font-semibold">POS 資料匯入</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          上傳 iCHEF 匯出的 .xlsx 檔案，即時解析銷售數據
        </p>
      </div>

      {/* 上傳區 */}
      <DropZone onFiles={handleFiles} isLoading={isLoading} />

      {/* 已上傳提示 */}
      {systemItems.length === 0 && parsedFiles.some((f) => f.result.type === 'item-overview') && (
        <div className="flex items-start gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2.5 text-sm text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>系統品項清單載入中，品項比對功能暫時停用</span>
        </div>
      )}

      {/* 解析結果 */}
      {parsedFiles.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tab 標頭（含刪除按鈕） */}
          <div className="flex items-start gap-2 overflow-x-auto pb-1">
            <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
              {parsedFiles.map((pf) => (
                <TabsTrigger
                  key={pf.id}
                  value={pf.id}
                  className="flex items-center gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-3 py-1.5 text-sm border border-border data-[state=inactive]:bg-card"
                >
                  <FileSpreadsheet className="size-3.5 shrink-0" />
                  <span className="max-w-[120px] truncate" title={pf.fileName}>
                    {pf.fileName.replace(/\.xlsx$/i, '')}
                  </span>
                  <span
                    className={[
                      'inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-medium',
                      typeBadgeClass(pf.result.type),
                    ].join(' ')}
                  >
                    {TYPE_LABEL[pf.result.type]}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(pf.id)
                    }}
                    className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5"
                    title="移除"
                  >
                    <X className="size-3" />
                  </button>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Tab 內容 */}
          {parsedFiles.map((pf) => (
            <TabsContent key={pf.id} value={pf.id} className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileSpreadsheet className="size-4" />
                      {pf.fileName}
                    </CardTitle>
                    <Badge className={typeBadgeClass(pf.result.type)}>
                      {TYPE_LABEL[pf.result.type]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* item-overview */}
                  {pf.result.type === 'item-overview' && pf.matchedRows && (
                    <ItemOverviewTable
                      rows={pf.matchedRows}
                      summary={pf.result.summary}
                    />
                  )}

                  {/* category-overview */}
                  {pf.result.type === 'category-overview' && (
                    <CategoryOverviewTable
                      rows={pf.result.rows}
                      summary={pf.result.summary}
                    />
                  )}

                  {/* checkout */}
                  {pf.result.type === 'checkout' && (
                    <CheckoutTable
                      rows={pf.result.rows}
                      summary={pf.result.summary}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* 空狀態說明 */}
      {parsedFiles.length === 0 && !isLoading && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">支援以下 iCHEF 匯出格式：</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              {
                type: 'item-overview',
                title: '品項銷售概覽',
                desc: '各品項的銷售量、點選率、營業額，自動比對系統品項算毛利',
              },
              {
                type: 'category-overview',
                title: '分類銷售概覽',
                desc: '各分類的銷售量與營業額占比分析',
              },
              {
                type: 'checkout',
                title: '結帳紀錄',
                desc: '每筆結帳的時間、桌號、金額、付款方式明細',
              },
            ].map((item) => (
              <Card key={item.type} className="border-dashed">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={['inline-flex h-5 items-center rounded-full px-2 text-xs font-medium', typeBadgeClass(item.type)].join(' ')}>
                      {TYPE_LABEL[item.type]}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 輔助函式 ─────────────────────────────────────────────────────────────────

/** 取得各類型的資料列數 */
function getRowCount(result: PosParseResult): number {
  return result.rows.length
}
