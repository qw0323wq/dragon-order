'use client'

/**
 * 訂單管理頁面
 * 功能：
 *  1. 明細表格檢視
 *  2. 按供應商彙總（彙總視圖）
 *  3. 複製各供應商訂單文字（LINE/WhatsApp 傳給供應商）
 *  4. 標記已叫貨
 */

import { useState, useMemo } from 'react'
import {
  ClipboardCopy,
  CheckCircle,
  LayoutList,
  LayoutGrid,
  CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── Mock 資料 ─────────────────────────────────────────────────────────────────

/** 訂單品項型別 */
interface OrderItem {
  id: number
  item: string
  supplier: string
  /** 林森店數量 */
  linsen: number
  /** 信義安和店數量 */
  xinyi: number
  unit: string
  price: number
}

const MOCK_ORDER_ITEMS: OrderItem[] = [
  { id: 1, item: '台灣豬五花', supplier: '以曜', linsen: 10, xinyi: 8, unit: '斤', price: 150 },
  { id: 2, item: 'CH霜降牛', supplier: '以曜', linsen: 5, xinyi: 3, unit: '斤', price: 365 },
  { id: 3, item: '白蝦(40/50)', supplier: '瑞濱海鮮', linsen: 5, xinyi: 3, unit: '包', price: 305 },
  { id: 4, item: '高麗菜', supplier: '幕府', linsen: 3, xinyi: 2, unit: '把', price: 18 },
  { id: 5, item: '鴨血', supplier: '韓流', linsen: 20, xinyi: 15, unit: '份', price: 25 },
  { id: 6, item: '台灣啤酒', supplier: '鉊玖', linsen: 20, xinyi: 10, unit: '瓶', price: 47 },
]

/** 今日日期（顯示用） */
const TODAY = '2026/03/21'

/** 門店地址（複製訂單文字時附上） */
const STORE_ADDRESSES = {
  linsen: '中山北路一段135巷38號2樓',
  xinyi: '敦化南路二段63巷53弄8號',
}

// ── 輔助計算 ──────────────────────────────────────────────────────────────────

/** 計算品項小計金額 */
function calcSubtotal(item: OrderItem): number {
  return (item.linsen + item.xinyi) * item.price
}

/** 按供應商分組，回傳 Map<供應商名稱, 品項陣列> */
function groupBySupplier(items: OrderItem[]): Map<string, OrderItem[]> {
  const map = new Map<string, OrderItem[]>()
  for (const item of items) {
    if (!map.has(item.supplier)) map.set(item.supplier, [])
    map.get(item.supplier)!.push(item)
  }
  return map
}

/** 產生可複製到剪貼簿的供應商訂單文字 */
function buildOrderText(supplier: string, items: OrderItem[]): string {
  const total = items.reduce((sum, i) => sum + calcSubtotal(i), 0)

  // 計算欄位最大寬度，讓對齊更整齊
  const rows = items.map((i) => ({
    item: i.item,
    linsen: `${i.linsen}${i.unit}`,
    xinyi: `${i.xinyi}${i.unit}`,
    total: `${i.linsen + i.xinyi}${i.unit}`,
  }))

  const lines = rows.map(
    (r) => `${r.item.padEnd(10)} | ${r.linsen.padStart(5)} | ${r.xinyi.padStart(5)} | ${r.total.padStart(5)}`
  )

  return [
    `📦 ${supplier} 訂單 — 肥龍老火鍋 ${TODAY}`,
    `${'品項'.padEnd(10)} | 林森店  | 信義安和 | 合計`,
    ...lines,
    `📍 林森店：${STORE_ADDRESSES.linsen}`,
    `📍 信義安和店：${STORE_ADDRESSES.xinyi}`,
    `預估金額：$${total.toLocaleString()}`,
    `麻煩明天配送，謝謝 🙏`,
  ].join('\n')
}

// ── 彙總供應商卡片 ────────────────────────────────────────────────────────────

interface SupplierCardProps {
  supplier: string
  items: OrderItem[]
  /** 是否已標記叫貨完成 */
  ordered: boolean
  onMarkOrdered: (supplier: string) => void
}

function SupplierOrderCard({ supplier, items, ordered, onMarkOrdered }: SupplierCardProps) {
  const subtotal = items.reduce((sum, i) => sum + calcSubtotal(i), 0)

  /** 複製訂單文字到剪貼簿 */
  async function handleCopy() {
    const text = buildOrderText(supplier, items)
    try {
      await navigator.clipboard.writeText(text)
      // CRITICAL: 用原生 alert 避免引入 toast 依賴，實際可換成 sonner
      alert(`已複製 ${supplier} 的訂單文字！`)
    } catch {
      // 降級方案：選取輸入框
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      alert(`已複製 ${supplier} 的訂單文字！`)
    }
  }

  return (
    <Card className={ordered ? 'opacity-70' : ''}>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{supplier}</CardTitle>
            {ordered && (
              <Badge variant="default" className="gap-1">
                <CheckCircle className="size-3" />
                已叫貨
              </Badge>
            )}
          </div>
          <span className="text-sm font-semibold text-primary">
            小計 ${subtotal.toLocaleString()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        {/* 品項明細表 */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>品項</TableHead>
              <TableHead className="text-right">林森店</TableHead>
              <TableHead className="text-right">信義安和</TableHead>
              <TableHead className="text-right">合計</TableHead>
              <TableHead className="text-right">單價</TableHead>
              <TableHead className="text-right">小計</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.item}</TableCell>
                <TableCell className="text-right">
                  {item.linsen} {item.unit}
                </TableCell>
                <TableCell className="text-right">
                  {item.xinyi} {item.unit}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {item.linsen + item.xinyi} {item.unit}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  ${item.price}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${calcSubtotal(item).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Separator className="my-3" />

        {/* 操作按鈕 */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleCopy}
          >
            <ClipboardCopy className="size-3.5" />
            複製訂單文字
          </Button>
          <Button
            variant={ordered ? 'secondary' : 'default'}
            size="sm"
            className="gap-1.5"
            onClick={() => onMarkOrdered(supplier)}
          >
            <CheckCircle className="size-3.5" />
            {ordered ? '取消叫貨標記' : '標記已叫貨'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

type ViewMode = 'detail' | 'summary'

export default function OrdersPage() {
  /** 目前選取的日期（預設今天） */
  const [selectedDate] = useState(TODAY)

  /** 目前顯示模式：明細 or 彙總 */
  const [viewMode, setViewMode] = useState<ViewMode>('detail')

  /** 已標記叫貨的供應商 Set */
  const [orderedSuppliers, setOrderedSuppliers] = useState<Set<string>>(new Set())

  /** 按供應商分組的 Map */
  const supplierGroups = useMemo(
    () => groupBySupplier(MOCK_ORDER_ITEMS),
    []
  )

  /** 訂單總金額 */
  const grandTotal = useMemo(
    () => MOCK_ORDER_ITEMS.reduce((sum, i) => sum + calcSubtotal(i), 0),
    []
  )

  /** 已叫貨供應商數 */
  const orderedCount = orderedSuppliers.size

  /** 切換供應商叫貨標記 */
  function toggleOrdered(supplier: string) {
    setOrderedSuppliers((prev) => {
      const next = new Set(prev)
      if (next.has(supplier)) next.delete(supplier)
      else next.add(supplier)
      return next
    })
  }

  /** 整體訂單狀態 */
  const allOrdered = orderedCount === supplierGroups.size && supplierGroups.size > 0
  const orderStatus = allOrdered ? '已完成' : orderedCount > 0 ? '進行中' : '待處理'
  const statusVariant = allOrdered ? 'default' : orderedCount > 0 ? 'secondary' : 'outline'

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── 頂部資訊列 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="font-heading text-xl font-semibold">訂單管理</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {selectedDate}
            </div>
            <Badge variant={statusVariant as 'default' | 'secondary' | 'outline'}>{orderStatus}</Badge>
            <span className="text-xs text-muted-foreground">
              {orderedCount}/{supplierGroups.size} 供應商已叫貨
            </span>
          </div>
        </div>

        {/* 合計金額 */}
        <div className="text-right">
          <p className="text-xs text-muted-foreground">今日採購總計</p>
          <p className="text-xl font-bold font-heading text-primary">
            ${grandTotal.toLocaleString()}
          </p>
        </div>
      </div>

      {/* ── 視圖切換 ── */}
      <div className="flex gap-2">
        <Button
          variant={viewMode === 'detail' ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          onClick={() => setViewMode('detail')}
        >
          <LayoutList className="size-3.5" />
          明細
        </Button>
        <Button
          variant={viewMode === 'summary' ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          onClick={() => setViewMode('summary')}
        >
          <LayoutGrid className="size-3.5" />
          彙總（按供應商）
        </Button>
      </div>

      {/* ── 明細表格視圖 ── */}
      {viewMode === 'detail' && (
        <Card>
          <CardHeader>
            <CardTitle>訂單明細</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品項</TableHead>
                  <TableHead>供應商</TableHead>
                  <TableHead className="text-right">林森店</TableHead>
                  <TableHead className="text-right">信義安和</TableHead>
                  <TableHead className="text-right">合計</TableHead>
                  <TableHead>單位</TableHead>
                  <TableHead className="text-right">單價</TableHead>
                  <TableHead className="text-right">小計</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_ORDER_ITEMS.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.item}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.supplier}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{item.linsen}</TableCell>
                    <TableCell className="text-right">{item.xinyi}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {item.linsen + item.xinyi}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      ${item.price}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      ${calcSubtotal(item).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {/* 合計列 */}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={7} className="font-semibold text-right">
                    總計
                  </TableCell>
                  <TableCell className="text-right font-bold text-primary text-base">
                    ${grandTotal.toLocaleString()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── 彙總視圖（按供應商分組卡片）── */}
      {viewMode === 'summary' && (
        <div className="space-y-4">
          {Array.from(supplierGroups.entries()).map(([supplier, items]) => (
            <SupplierOrderCard
              key={supplier}
              supplier={supplier}
              items={items}
              ordered={orderedSuppliers.has(supplier)}
              onMarkOrdered={toggleOrdered}
            />
          ))}
        </div>
      )}
    </div>
  )
}
