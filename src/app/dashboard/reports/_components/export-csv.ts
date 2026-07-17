/**
 * C12 — 報表匯出 CSV
 *
 * 把「當前 tab 已載入的 data」轉成 CSV 字串（含表頭）。每個 tab 的欄位對應它自己畫面上的表格。
 * 純函式、無副作用；實際觸發下載由 page.tsx 呼叫 lib/csv 的 downloadCsv 完成。
 *
 * 沒有可匯出的資料列時一律回 null → page.tsx 依此把「匯出」按鈕 disabled。
 */
import { toCsv, type CsvValue } from '@/lib/csv'
import type {
  TabKey, ConsumptionData, SuggestionData, ComparisonData,
  ScoreData, SettlementData, GroupData,
} from './types'

/** 六個 tab 的資料聯集 */
export type ReportData =
  | ConsumptionData | SuggestionData | ComparisonData
  | ScoreData | SettlementData | GroupData

/** 一位小數的佔比字串（與畫面 pct() 一致） */
function pct(n: number): string {
  return `${Number(n).toFixed(1)}%`
}

/** 叫貨建議：攤平「供應商 → 品項」兩層成一列一品項 */
function suggestionsCsv(d: SuggestionData): string | null {
  const rows: CsvValue[][] = []
  for (const group of d.suppliers) {
    for (const it of group.items) {
      rows.push([
        group.supplierName, it.name, it.category, it.unit,
        it.currentStock, it.safetyStock, it.suggestedQty, it.estimatedCost,
      ])
    }
  }
  if (rows.length === 0) return null
  return toCsv(rows, ['供應商', '品項', '分類', '單位', '目前庫存', '安全庫存', '建議叫貨量', '預估金額'])
}

/** 消耗報表：損耗率 null 顯示「—」與畫面一致 */
function consumptionCsv(d: ConsumptionData): string | null {
  if (d.items.length === 0) return null
  const rows: CsvValue[][] = d.items.map(i => [
    i.itemName, i.unit, i.theoreticalQty, i.actualQty, i.diff,
    i.wasteRate !== null ? `${i.wasteRate}%` : '—',
  ])
  return toCsv(rows, ['品項', '單位', '理論消耗', '實際消耗', '差異', '損耗率'])
}

/** 歷史比較：上期/本期用量 + 變動 */
function comparisonCsv(d: ComparisonData): string | null {
  if (d.items.length === 0) return null
  const rows: CsvValue[][] = d.items.map(i => [
    i.name, i.unit, i.supplier, i.period1Qty, i.period2Qty, i.diff,
    `${i.changeRate}%`, i.isAnomaly ? '是' : '',
  ])
  return toCsv(rows, ['品項', '單位', '供應商', '上期', '本期', '變動', '變動率', '異常'])
}

/** 供應商評分：各面向分數（數值保留原樣供 Excel 計算） */
function scoresCsv(d: ScoreData): string | null {
  if (d.suppliers.length === 0) return null
  const rows: CsvValue[][] = d.suppliers.map(s => [
    s.supplierName, s.supplierCategory,
    s.scores.overall, s.scores.quality, s.scores.delivery, s.scores.completion,
    s.totalPOs, s.totalReceiving,
    s.issues.qualityIssues, s.issues.shortages, s.issues.missing,
  ])
  return toCsv(rows, [
    '供應商', '分類', '總評分', '品質', '交貨', '完成率',
    'PO數', '驗收數', '品質問題', '短缺', '缺漏',
  ])
}

/** 調撥對帳：匯出「明細」（攤平每對門市底下的每筆調撥品項） */
function settlementCsv(d: SettlementData): string | null {
  const rows: CsvValue[][] = []
  for (const pair of d.pairs) {
    for (const it of pair.items) {
      rows.push([
        pair.fromStoreName, pair.toStoreName, it.transferNumber, it.itemName,
        it.quantity, it.returnedQty, it.netQty, it.amount,
      ])
    }
  }
  if (rows.length === 0) return null
  return toCsv(rows, ['出貨門市', '收貨門市', '調撥單號', '品項', '數量', '退還量', '淨量', '金額'])
}

/**
 * 集團報表：畫面是四張子表的儀表板，CSV 用「分節」方式全部帶出，
 * 每節一個中文小標 + 該表的表頭與資料，節與節之間空一行。
 */
function groupCsv(d: GroupData): string | null {
  const sections: string[] = []

  if (d.storeSpending.length > 0) {
    sections.push('【各店採購金額】\r\n' + toCsv(
      d.storeSpending.map(s => [s.store_name, s.order_count, s.total_amount, pct(Number(s.percentage))]),
      ['門市', '訂單數', '採購金額', '佔比'],
    ))
  }
  if (d.categoryCost.length > 0) {
    sections.push('【分類成本佔比】\r\n' + toCsv(
      d.categoryCost.map(c => [c.category, c.total_amount, pct(Number(c.percentage))]),
      ['分類', '採購金額', '佔比'],
    ))
  }
  if (d.topItems.length > 0) {
    sections.push('【採購金額排行】\r\n' + toCsv(
      d.topItems.map((i, idx) => [idx + 1, i.name, i.category, i.supplier_name, i.total_qty, i.total_amount]),
      ['#', '品項', '分類', '供應商', '數量', '採購金額'],
    ))
  }
  if (d.supplierSpending.length > 0) {
    sections.push('【供應商採購金額排名】\r\n' + toCsv(
      d.supplierSpending.map(s => [s.name, s.order_count, s.total_amount]),
      ['供應商', '訂單數', '採購金額'],
    ))
  }

  if (sections.length === 0) return null
  return sections.join('\r\n\r\n')
}

/**
 * 依當前 tab 把已載入的 data 轉成 CSV 字串（含表頭，不含 BOM）。
 * 無資料回 null。tab 與 data 必為對應關係（由 page.tsx 的 currentData 保證）。
 */
export function buildReportCsv(tab: TabKey, data: ReportData): string | null {
  switch (tab) {
    case 'suggestions': return suggestionsCsv(data as SuggestionData)
    case 'consumption': return consumptionCsv(data as ConsumptionData)
    case 'comparison': return comparisonCsv(data as ComparisonData)
    case 'scores': return scoresCsv(data as ScoreData)
    case 'settlement': return settlementCsv(data as SettlementData)
    case 'group': return groupCsv(data as GroupData)
  }
}
