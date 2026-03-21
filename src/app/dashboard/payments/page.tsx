'use client'

/**
 * 月結報表頁面（給會計/老闆用）
 * 功能：
 *  1. 選擇月份（預設本月）
 *  2. 按供應商列出：名稱 | 結帳方式 | 訂單筆數 | 總金額 | 已付 | 未付
 *  3. 月結供應商：顯示當月累計應付
 *  4. 現結供應商：顯示已付 vs 未付
 *  5. 底部合計列
 *  6. 可列印（print-friendly 樣式）
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

// ── 型別 ─────────────────────────────────────────────────────────────────────

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

/** 格式化月份為顯示用 YYYY 年 MM 月 */
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

function fmtAmount(n: number): string {
  return `$${n.toLocaleString()}`
}

// ── 頁面主元件 ────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const currentMonth = formatMonth(new Date())
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [markingPaid, setMarkingPaid] = useState<number | null>(null)

  const isCurrentMonth = selectedMonth === currentMonth

  // 載入月結報表
  const loadReport = useCallback(async (month: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/payments?month=${month}`)
      if (!res.ok) {
        toast.error('載入報表失敗')
        return
      }
      const data = await res.json()
      setReport(data)
    } catch {
      toast.error('載入報表失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReport(selectedMonth)
  }, [selectedMonth, loadReport])

  // 標記供應商付款（針對月結供應商）
  async function handleMarkMonthlyPaid(supplierId: number, supplierName: string, amount: number) {
    setMarkingPaid(supplierId)
    try {
      // 月結付款：找到當月所有未付訂單並批次標記
      // 這裡透過 PATCH 更新所有未付的 payment 紀錄
      // 先 POST 建立整月付款紀錄（若不存在）
      const res = await fetch('/api/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          month: selectedMonth,
          status: 'paid',
          notes: `月結付款 ${formatMonthDisplay(selectedMonth)}`,
        }),
      })

      if (res.ok) {
        toast.success(`已標記 ${supplierName} 月結付款完成`)
        await loadReport(selectedMonth)
      } else {
        toast.error('標記失敗，請重試')
      }
    } catch {
      toast.error('發生錯誤')
    } finally {
      setMarkingPaid(null)
    }
  }

  // 列印
  function handlePrint() {
    window.print()
  }

  // 分類供應商
  const monthlySuppliers = report?.suppliers.filter((s) => s.paymentType === '月結') ?? []
  const cashSuppliers = report?.suppliers.filter((s) => s.paymentType === '現結') ?? []

  return (
    <div className="p-4 md:p-6 space-y-5 print:p-4">
      {/* 頁面標題 */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="font-heading text-xl font-semibold">月結報表</h2>
          <p className="text-sm text-muted-foreground mt-0.5">供應商帳款管理</p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={handlePrint}>
          <Printer className="size-4" />
          列印
        </Button>
      </div>

      {/* 列印用標題 */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">肥龍老火鍋 — 採購帳款報表</h1>
        <p className="text-sm text-gray-500">{formatMonthDisplay(selectedMonth)}</p>
      </div>

      {/* 月份選擇 */}
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

      {/* 載入中 */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 報表內容 */}
      {!loading && report && (
        <>
          {/* 摘要統計卡片 */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">採購總金額</p>
                <p className="text-lg font-bold text-primary font-heading">
                  {fmtAmount(report.summary.totalAmount)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">已付金額</p>
                <p className="text-lg font-bold text-green-600 font-heading">
                  {fmtAmount(report.summary.paidAmount)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">未付金額</p>
                <p className={`text-lg font-bold font-heading ${
                  report.summary.unpaidAmount > 0 ? 'text-red-600' : 'text-muted-foreground'
                }`}>
                  {fmtAmount(report.summary.unpaidAmount)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 無資料 */}
          {report.suppliers.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground">
                  {formatMonthDisplay(selectedMonth)} 沒有採購紀錄
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── 月結供應商 ── */}
          {monthlySuppliers.length > 0 && (
            <Card>
              <CardHeader className="border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">月結供應商</CardTitle>
                  <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                    {monthlySuppliers.length} 家
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>供應商</TableHead>
                      <TableHead className="text-center">訂單筆數</TableHead>
                      <TableHead className="text-right">當月總計</TableHead>
                      <TableHead className="text-right">已付</TableHead>
                      <TableHead className="text-right">未付</TableHead>
                      <TableHead className="print:hidden">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlySuppliers.map((s) => {
                      const isFullyPaid = s.unpaidAmount === 0
                      return (
                        <TableRow
                          key={s.supplierId}
                          className={isFullyPaid ? 'opacity-60' : ''}
                        >
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
                          <TableCell className="print:hidden">
                            {isFullyPaid ? (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 className="size-3.5" />
                                已結清
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                disabled={markingPaid === s.supplierId}
                                onClick={() => handleMarkMonthlyPaid(s.supplierId, s.supplierName, s.unpaidAmount)}
                              >
                                {markingPaid === s.supplierId ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <CreditCard className="size-3" />
                                )}
                                標記已付
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {/* 月結小計 */}
                    <TableRow className="bg-blue-50/50 font-semibold">
                      <TableCell colSpan={2}>月結小計</TableCell>
                      <TableCell className="text-right">
                        {fmtAmount(monthlySuppliers.reduce((s, r) => s + r.totalAmount, 0))}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {fmtAmount(monthlySuppliers.reduce((s, r) => s + r.paidAmount, 0))}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {fmtAmount(monthlySuppliers.reduce((s, r) => s + r.unpaidAmount, 0))}
                      </TableCell>
                      <TableCell className="print:hidden" />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ── 現結供應商 ── */}
          {cashSuppliers.length > 0 && (
            <Card>
              <CardHeader className="border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">現結供應商</CardTitle>
                  <Badge className="bg-red-100 text-red-700 border-red-200">
                    {cashSuppliers.length} 家
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>供應商</TableHead>
                      <TableHead className="text-center">訂單筆數</TableHead>
                      <TableHead className="text-right">當月總計</TableHead>
                      <TableHead className="text-right">已付</TableHead>
                      <TableHead className="text-right">未付</TableHead>
                      <TableHead>狀態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashSuppliers.map((s) => {
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
                          <TableCell>
                            {isFullyPaid ? (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 className="size-3.5" />
                                已付清
                              </span>
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
                    {/* 現結小計 */}
                    <TableRow className="bg-red-50/50 font-semibold">
                      <TableCell colSpan={2}>現結小計</TableCell>
                      <TableCell className="text-right">
                        {fmtAmount(cashSuppliers.reduce((s, r) => s + r.totalAmount, 0))}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {fmtAmount(cashSuppliers.reduce((s, r) => s + r.paidAmount, 0))}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {fmtAmount(cashSuppliers.reduce((s, r) => s + r.unpaidAmount, 0))}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* ── 總計 ── */}
          {report.suppliers.length > 0 && (
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

              {/* 列印備注 */}
              <div className="hidden print:block mt-8 text-xs text-gray-400">
                報表產生時間：{new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
