'use client'

/**
 * 帳務管理頁面（會計 / 老闆用）
 *
 * 兩種視角：
 *  1. 總公司模式（預設）— 訂單級別付款明細，可勾選 + 填匯款日期 + 標記已付
 *  2. 門市模式 — 選定門市後顯示該門市採購明細（純檢視/列印）
 *
 * 列印行為：
 *  - 總公司：標題「月結報表 — YYYY年MM月」
 *  - 門市：公司名稱 + 統編 + 採購對帳單（正式單據格式）
 *
 * 拆分：
 *   _components/types.ts                  — 共用型別（含 OrderPaymentRow）
 *   _components/summary-cards.tsx         — 頂部 4 張摘要卡（採購/應付/已付/未付）
 *   _components/hq-supplier-table.tsx     — 總公司供應商總覽（純顯示，列印用）
 *   _components/order-payment-list.tsx    — 訂單付款明細（核心操作介面）
 *   _components/store-supplier-table.tsx  — 門市採購對帳單
 *
 * 重構（2026-04-28）：
 *   - 付款 grain 從 supplier 改為訂單×供應商
 *   - 標記已付支援填匯款日期（單筆 / 批次）
 *   - 修「沒有待付帳款」bug — 新流程走 POST upsert，不依賴既存 payments row
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Printer, Building2, Store } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

import { formatMonth, formatMonthDisplay, formatCurrency as fmtAmount } from '@/lib/format'
import { MonthSelector } from '@/components/month-selector'
import { SkeletonTable } from '@/components/ui/skeleton'

import type { Store as StoreType, MonthlyReport, ActiveTab } from './_components/types'
import { SummaryCards } from './_components/summary-cards'
import { HQSupplierTable } from './_components/hq-supplier-table'
import { StoreSupplierTable } from './_components/store-supplier-table'
import { OrderPaymentList } from './_components/order-payment-list'

export default function PaymentsPage() {
  const currentMonth = formatMonth(new Date())

  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [activeTab, setActiveTab] = useState<ActiveTab>('hq')
  const [stores, setStores] = useState<StoreType[]>([])
  const [storesLoading, setStoresLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<MonthlyReport | null>(null)

  // 載入門市列表
  useEffect(() => {
    async function loadStores() {
      try {
        const res = await fetch('/api/stores')
        if (!res.ok) {
          toast.error('載入門市列表失敗')
          return
        }
        const data: StoreType[] = await res.json()
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

  const reloadCurrent = useCallback(
    () => loadReport(selectedMonth, activeTab),
    [loadReport, selectedMonth, activeTab]
  )

  function handlePrint() {
    window.print()
  }

  // 分類供應商（總公司模式總覽用）
  const monthlySuppliers = report?.suppliers.filter((s) => s.paymentType === '月結') ?? []
  const cashSuppliers = report?.suppliers.filter((s) => s.paymentType === '現結') ?? []
  const currentStoreInfo = report?.storeInfo ?? null

  // 列印標題
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
          <div>
            <h1 className="text-2xl font-bold">肥龍老火鍋</h1>
            <p className="text-base mt-1">{printTitle}</p>
          </div>
        ) : currentStoreInfo ? (
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

      {/* ── Tab 視角切換 ─────────────────────────────────────────────────── */}
      {!storesLoading && (
        <div className="print:hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="hq" className="gap-1.5 text-sm">
                <Building2 className="size-3.5" />
                總公司
              </TabsTrigger>
              {stores.filter((s) => s.type !== 'warehouse').map((store) => (
                <TabsTrigger key={store.id} value={String(store.id)} className="gap-1.5 text-sm">
                  <Store className="size-3.5" />
                  {store.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* ── 月份選擇 ─────────────────────────────────────────────────────── */}
      <div className="print:hidden">
        <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
      </div>

      {/* ── 載入中骨架屏 ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="print:hidden">
          <SkeletonTable rows={6} cols={5} />
        </div>
      )}

      {/* ── 報表主內容 ────────────────────────────────────────────────────── */}
      {!loading && report && (
        <>
          {/* 門市資訊卡片（門市 Tab 專用） */}
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
            payableAmount={report.summary.payableAmount}
            paidAmount={report.summary.paidAmount}
            unpaidAmount={report.summary.unpaidAmount}
          />

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

          {/* ── 總公司模式 ── */}
          {activeTab === 'hq' && report.suppliers.length > 0 && (
            <>
              {/* 供應商總覽（純顯示，列印用） */}
              <HQSupplierTable suppliers={monthlySuppliers} paymentType="月結" />
              <HQSupplierTable suppliers={cashSuppliers} paymentType="現結" />

              {/* 訂單付款明細（核心操作介面） */}
              <Separator className="my-4" />
              <OrderPaymentList orders={report.orders} paymentType="月結" onReload={reloadCurrent} />
              <OrderPaymentList orders={report.orders} paymentType="現結" onReload={reloadCurrent} />
            </>
          )}

          {/* ── 門市模式 ── */}
          {activeTab !== 'hq' && <StoreSupplierTable suppliers={report.suppliers} />}

          {/* ── 月份合計（總公司模式才顯示） ── */}
          {report.suppliers.length > 0 && activeTab === 'hq' && (
            <>
              <Separator />
              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <Table>
                    <TableBody>
                      <TableRow className="font-bold text-base">
                        <TableCell className="text-lg">月份合計</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          採購 {fmtAmount(report.summary.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right text-primary text-lg">
                          應付 {fmtAmount(report.summary.payableAmount)}
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
