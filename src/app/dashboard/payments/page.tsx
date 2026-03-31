'use client'

/**
 * 帳務管理頁面（會計 / 老闆用）
 *
 * 兩種視角：
 *  1. 總公司模式（預設）— 按月份看所有供應商應付帳款，可標記付款
 *  2. 門市模式 — 選定門市後顯示該門市採購明細，支援列印
 *
 * 列印行為：
 *  - 總公司：標題「月結報表 — YYYY年MM月」
 *  - 門市：公司名稱 + 統編 + 採購對帳單（正式單據格式）
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Loader2,
  CheckCircle2,
  CreditCard,
  AlertCircle,
  Building2,
  Store,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ── 型別定義 ──────────────────────────────────────────────────────────────────

interface StoreInfo {
  id: number
  name: string
  companyName: string | null
  taxId: string | null
}

interface Store extends StoreInfo {
  address: string | null
  hours: string | null
  manager: string | null
  phone: string | null
  sortOrder: number
}

interface SupplierPaymentReport {
  supplierId: number
  supplierName: string
  paymentType: string
  orderCount: number
  totalAmount: number
  paidAmount: number
  pendingAmount: number
  unpaidAmount: number
  payments: Array<{
    id: number
    status: string
    amount: number
    paidAt: string | null
  }>
}

interface MonthlyReport {
  month: string
  storeId: number | null
  storeInfo: StoreInfo | null
  suppliers: SupplierPaymentReport[]
  summary: {
    totalAmount: number
    paidAmount: number
    unpaidAmount: number
  }
}

// ── 月份工具 ─────────────────────────────────────────────────────────────────

/** 格式化月份為 YYYY-MM */
function formatMonth(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** 格式化月份為顯示用：YYYY 年 MM 月 */
function formatMonthDisplay(month: string): string {
  const [y, m] = month.split('-')
  return `${y} 年 ${parseInt(m)} 月`
}

/** 月份加減 */
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return formatMonth(d)
}

// ── 金額格式化 ────────────────────────────────────────────────────────────────

/** 格式化為新台幣顯示，如 $12,345 */
function fmtAmount(n: number): string {
  return `$${n.toLocaleString()}`
}

// ── Tab 識別碼型別 ─────────────────────────────────────────────────────────

/** 'hq' 代表總公司，數字字串代表門市 ID */
type ActiveTab = 'hq' | string

// ── 摘要卡片元件 ─────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  totalAmount: number
  paidAmount: number
  unpaidAmount: number
}

function SummaryCards({ totalAmount, paidAmount, unpaidAmount }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-3 print:gap-2">
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">採購總金額</p>
          <p className="text-lg font-bold text-primary font-heading">
            {fmtAmount(totalAmount)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">已付金額</p>
          <p className="text-lg font-bold text-green-600 font-heading">
            {fmtAmount(paidAmount)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">未付金額</p>
          <p className={`text-lg font-bold font-heading ${
            unpaidAmount > 0 ? 'text-red-600' : 'text-muted-foreground'
          }`}>
            {fmtAmount(unpaidAmount)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── 總公司報表表格 ────────────────────────────────────────────────────────────

interface HQTableProps {
  suppliers: SupplierPaymentReport[]
  paymentType: '月結' | '現結'
  markingPaid: number | null
  onMarkPaid: (supplierId: number, supplierName: string, amount: number) => void
}

function HQSupplierTable({ suppliers, paymentType, markingPaid, onMarkPaid }: HQTableProps) {
  if (suppliers.length === 0) return null

  const isMonthly = paymentType === '月結'
  const subtotalAmount = suppliers.reduce((s, r) => s + r.totalAmount, 0)
  const subtotalPaid = suppliers.reduce((s, r) => s + r.paidAmount, 0)
  const subtotalUnpaid = suppliers.reduce((s, r) => s + r.unpaidAmount, 0)

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{paymentType}供應商</CardTitle>
          <Badge
            className={isMonthly
              ? 'bg-blue-100 text-blue-700 border-blue-200'
              : 'bg-orange-100 text-orange-700 border-orange-200'
            }
          >
            {suppliers.length} 家
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>供應商</TableHead>
              <TableHead>結帳方式</TableHead>
              <TableHead className="text-center">訂單筆數</TableHead>
              <TableHead className="text-right">總金額</TableHead>
              <TableHead className="text-right">已付</TableHead>
              <TableHead className="text-right">未付</TableHead>
              <TableHead className="print:hidden">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => {
              const isFullyPaid = s.unpaidAmount === 0
              return (
                <TableRow key={s.supplierId} className={isFullyPaid ? 'opacity-60' : ''}>
                  <TableCell className="font-medium">{s.supplierName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {s.paymentType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">{s.orderCount} 筆</TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmtAmount(s.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {fmtAmount(s.paidAmount)}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${
                    s.unpaidAmount > 0 ? 'text-red-600' : 'text-muted-foreground'
                  }`}>
                    {fmtAmount(s.unpaidAmount)}
                  </TableCell>
                  <TableCell className="print:hidden">
                    {isFullyPaid ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="size-3.5" />
                        已結清
                      </span>
                    ) : isMonthly ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={markingPaid === s.supplierId}
                        onClick={() => onMarkPaid(s.supplierId, s.supplierName, s.unpaidAmount)}
                      >
                        {markingPaid === s.supplierId ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <CreditCard className="size-3" />
                        )}
                        標記已付
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-orange-600">
                        <AlertCircle className="size-3.5" />
                        待付款
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {/* 小計列 */}
            <TableRow className={`font-semibold ${isMonthly ? 'bg-blue-50/50' : 'bg-orange-50/50'}`}>
              <TableCell colSpan={3}>{paymentType}小計</TableCell>
              <TableCell className="text-right">{fmtAmount(subtotalAmount)}</TableCell>
              <TableCell className="text-right text-green-600">{fmtAmount(subtotalPaid)}</TableCell>
              <TableCell className="text-right text-red-600">{fmtAmount(subtotalUnpaid)}</TableCell>
              <TableCell className="print:hidden" />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ── 門市報表表格 ──────────────────────────────────────────────────────────────

interface StoreTableProps {
  suppliers: SupplierPaymentReport[]
}

function StoreSupplierTable({ suppliers }: StoreTableProps) {
  if (suppliers.length === 0) return null

  const subtotalAmount = suppliers.reduce((s, r) => s + r.totalAmount, 0)
  const subtotalPaid = suppliers.reduce((s, r) => s + r.paidAmount, 0)
  const subtotalUnpaid = suppliers.reduce((s, r) => s + r.unpaidAmount, 0)

  return (
    <Card>
      <CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>供應商</TableHead>
              <TableHead className="text-center">訂單筆數</TableHead>
              <TableHead className="text-right">總金額</TableHead>
              <TableHead className="text-right">已付</TableHead>
              <TableHead className="text-right">未付</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => {
              const isFullyPaid = s.unpaidAmount === 0
              return (
                <TableRow key={s.supplierId} className={isFullyPaid ? 'opacity-60' : ''}>
                  <TableCell className="font-medium">{s.supplierName}</TableCell>
                  <TableCell className="text-center text-sm">{s.orderCount} 筆</TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmtAmount(s.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {fmtAmount(s.paidAmount)}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${
                    s.unpaidAmount > 0 ? 'text-red-600' : 'text-muted-foreground'
                  }`}>
                    {fmtAmount(s.unpaidAmount)}
                  </TableCell>
                </TableRow>
              )
            })}
            {/* 合計列 */}
            <TableRow className="bg-muted/40 font-bold">
              <TableCell colSpan={2}>合計</TableCell>
              <TableCell className="text-right text-primary">{fmtAmount(subtotalAmount)}</TableCell>
              <TableCell className="text-right text-green-600">{fmtAmount(subtotalPaid)}</TableCell>
              <TableCell className="text-right text-red-600">{fmtAmount(subtotalUnpaid)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const currentMonth = formatMonth(new Date())

  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [activeTab, setActiveTab] = useState<ActiveTab>('hq')
  const [stores, setStores] = useState<Store[]>([])
  const [storesLoading, setStoresLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [markingPaid, setMarkingPaid] = useState<number | null>(null)

  const isCurrentMonth = selectedMonth === currentMonth

  // 載入門市列表
  useEffect(() => {
    async function loadStores() {
      try {
        const res = await fetch('/api/stores')
        if (!res.ok) {
          toast.error('載入門市列表失敗')
          return
        }
        const data: Store[] = await res.json()
        setStores(data)
      } catch {
        toast.error('載入門市列表失敗')
      } finally {
        setStoresLoading(false)
      }
    }
    loadStores()
  }, [])

  // 載入月結報表（當月份或 tab 切換時重新載入）
  const loadReport = useCallback(async (month: string, tab: ActiveTab) => {
    setLoading(true)
    try {
      const url = tab === 'hq'
        ? `/api/payments?month=${month}`
        : `/api/payments?month=${month}&storeId=${tab}`
      const res = await fetch(url)
      if (!res.ok) {
        toast.error('載入報表失敗')
        return
      }
      const data: MonthlyReport = await res.json()
      setReport(data)
    } catch {
      toast.error('載入報表失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReport(selectedMonth, activeTab)
  }, [selectedMonth, activeTab, loadReport])

  // 月結付款：透過 PATCH 逐筆標記該供應商所有未付 payment 為 paid
  async function handleMarkMonthlyPaid(
    supplierId: number,
    supplierName: string,
    _amount: number
  ) {
    const supplierData = report?.suppliers.find((s) => s.supplierId === supplierId)
    if (!supplierData) return

    // CRITICAL: 只標記 unpaid/pending 的 payments，不重複送出已付的
    const unpaidPayments = supplierData.payments.filter(
      (p) => p.status === 'unpaid' || p.status === 'pending'
    )

    if (unpaidPayments.length === 0) {
      toast.info(`${supplierName} 沒有待付款項`)
      return
    }

    setMarkingPaid(supplierId)
    try {
      // 逐筆標記付款（若無現有 payment 紀錄則跳過，由後端負責建立）
      const results = await Promise.all(
        unpaidPayments.map((p) =>
          fetch('/api/payments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId: p.id, status: 'paid' }),
          })
        )
      )

      const allOk = results.every((r) => r.ok)
      if (allOk) {
        toast.success(`已標記 ${supplierName} 付款完成`)
        await loadReport(selectedMonth, activeTab)
      } else {
        toast.error('部分標記失敗，請重試')
      }
    } catch {
      toast.error('發生錯誤，請重試')
    } finally {
      setMarkingPaid(null)
    }
  }

  // 列印
  function handlePrint() {
    window.print()
  }

  // 分類供應商（總公司模式用）
  const monthlySuppliers = report?.suppliers.filter((s) => s.paymentType === '月結') ?? []
  const cashSuppliers = report?.suppliers.filter((s) => s.paymentType === '現結') ?? []

  // 當前門市資訊（門市模式用）
  const currentStoreInfo = report?.storeInfo ?? null

  // 列印標題判斷
  const printTitle = activeTab === 'hq'
    ? `月結報表 — ${formatMonthDisplay(selectedMonth)}`
    : null

  return (
    <div className="p-4 md:p-6 space-y-5 print:p-6 print:space-y-4">

      {/* ── 螢幕標題（列印時隱藏） ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="font-heading text-xl font-semibold">帳務管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">供應商帳款與門市對帳</p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={handlePrint}>
          <Printer className="size-4" />
          列印
        </Button>
      </div>

      {/* ── 列印用抬頭 ────────────────────────────────────────────────────── */}
      <div className="hidden print:block mb-2">
        {activeTab === 'hq' ? (
          /* 總公司列印抬頭 */
          <div>
            <h1 className="text-2xl font-bold">肥龍老火鍋</h1>
            <p className="text-base mt-1">{printTitle}</p>
          </div>
        ) : currentStoreInfo ? (
          /* 門市列印抬頭（正式單據格式） */
          <div className="border-b-2 border-gray-800 pb-4 mb-4">
            <h1 className="text-2xl font-bold">
              {currentStoreInfo.companyName ?? currentStoreInfo.name}
            </h1>
            {currentStoreInfo.taxId && (
              <p className="text-sm mt-1 text-gray-700">
                統一編號：{currentStoreInfo.taxId}
              </p>
            )}
            <p className="text-base mt-2 font-semibold">
              採購對帳單 — {formatMonthDisplay(selectedMonth)}
            </p>
          </div>
        ) : (
          <h1 className="text-2xl font-bold">採購對帳單 — {formatMonthDisplay(selectedMonth)}</h1>
        )}
      </div>

      {/* ── Tab 視角切換（列印時隱藏） ────────────────────────────────────── */}
      {!storesLoading && (
        <div className="print:hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="hq" className="gap-1.5 text-sm">
                <Building2 className="size-3.5" />
                總公司
              </TabsTrigger>
              {stores.map((store) => (
                <TabsTrigger
                  key={store.id}
                  value={String(store.id)}
                  className="gap-1.5 text-sm"
                >
                  <Store className="size-3.5" />
                  {store.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* ── 月份選擇（列印時隱藏） ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 print:hidden">
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          onClick={() => setSelectedMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-sm font-semibold min-w-[120px] text-center">
          {formatMonthDisplay(selectedMonth)}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          onClick={() => setSelectedMonth((m) => addMonths(m, 1))}
          disabled={isCurrentMonth}
        >
          <ChevronRight className="size-4" />
        </Button>
        {!isCurrentMonth && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(currentMonth)}>
            回本月
          </Button>
        )}
      </div>

      {/* ── 載入中 ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20 print:hidden">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── 報表主內容 ────────────────────────────────────────────────────── */}
      {!loading && report && (
        <>
          {/* 門市資訊卡片（門市 Tab 專用，螢幕顯示） */}
          {activeTab !== 'hq' && currentStoreInfo && (
            <Card className="print:hidden">
              <CardContent className="pt-4 pb-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">公司名稱：</span>
                    <span className="font-semibold">
                      {currentStoreInfo.companyName ?? currentStoreInfo.name}
                    </span>
                  </div>
                  {currentStoreInfo.taxId && (
                    <div>
                      <span className="text-muted-foreground">統一編號：</span>
                      <span className="font-semibold">{currentStoreInfo.taxId}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">期間：</span>
                    <span className="font-semibold">{formatMonthDisplay(selectedMonth)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 摘要卡片 */}
          <SummaryCards
            totalAmount={report.summary.totalAmount}
            paidAmount={report.summary.paidAmount}
            unpaidAmount={report.summary.unpaidAmount}
          />

          {/* 無資料提示 */}
          {report.suppliers.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground">
                  {formatMonthDisplay(selectedMonth)} 沒有採購紀錄
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── 總公司模式 ── */}
          {activeTab === 'hq' && (
            <>
              <HQSupplierTable
                suppliers={monthlySuppliers}
                paymentType="月結"
                markingPaid={markingPaid}
                onMarkPaid={handleMarkMonthlyPaid}
              />
              <HQSupplierTable
                suppliers={cashSuppliers}
                paymentType="現結"
                markingPaid={markingPaid}
                onMarkPaid={handleMarkMonthlyPaid}
              />
            </>
          )}

          {/* ── 門市模式 ── */}
          {activeTab !== 'hq' && (
            <StoreSupplierTable suppliers={report.suppliers} />
          )}

          {/* ── 總計列（有資料才顯示） ── */}
          {report.suppliers.length > 0 && activeTab === 'hq' && (
            <>
              <Separator />
              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <Table>
                    <TableBody>
                      <TableRow className="font-bold text-base">
                        <TableCell className="text-lg">月份合計</TableCell>
                        <TableCell className="text-right text-primary text-lg">
                          {fmtAmount(report.summary.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          已付 {fmtAmount(report.summary.paidAmount)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          未付 {fmtAmount(report.summary.unpaidAmount)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          {/* ── 列印頁尾 ── */}
          <div className="hidden print:block mt-10 pt-4 border-t border-gray-300 text-xs text-gray-400 space-y-1">
            <p>報表產生時間：{new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p>
            {activeTab !== 'hq' && currentStoreInfo && (
              <p>
                {currentStoreInfo.companyName ?? currentStoreInfo.name}
                {currentStoreInfo.taxId ? `　統編：${currentStoreInfo.taxId}` : ''}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
