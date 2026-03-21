/**
 * iCHEF POS 匯出檔案解析器
 *
 * 支援三種 xlsx 格式：
 *  1. item-overview   — 品項銷售概覽
 *  2. category-overview — 分類銷售概覽
 *  3. checkout        — 結帳紀錄
 *
 * 設計決策：
 * - 解析全在瀏覽器前端進行，不上傳 Server
 * - 檔名辨識優先，若無法辨識則用欄位內容判斷
 * - 金額欄位統一轉成 number（去除逗號 + 百分比符號）
 */

import * as XLSX from 'xlsx'

// ── 型別定義 ────────────────────────────────────────────────────────────────

/** 品項銷售概覽（item-overview） */
export interface ItemOverviewRow {
  /** iCHEF 上的品項名稱 */
  name: string
  /** 商品管理分類 */
  category: string
  /** 平均售價（元） */
  avgPrice: number
  /** 點選率（百分比字串，如 "2.14%"） */
  clickRate: string
  /** 銷售量 */
  quantity: number
  /** 銷售量占比 */
  quantityRate: string
  /** 營業額（元） */
  revenue: number
  /** 營業額占比 */
  revenueRate: string
}

/** 分類銷售概覽（category-overview） */
export interface CategoryOverviewRow {
  name: string
  clickRate: string
  quantity: number
  quantityRate: string
  revenue: number
  revenueRate: string
}

/** 結帳紀錄（checkout） */
export interface CheckoutRow {
  /** 發票號碼 */
  invoiceNo: string
  /** 結帳時間 */
  checkoutTime: string
  /** 桌號 */
  tableNo: string
  /** 訂單來源 */
  orderSource: string
  /** 折扣金額 */
  discount: number
  /** 發票金額（元） */
  amount: number
  /** 付款方式（現金/信用卡/...） */
  payMethod: string
  /** 品項（原始字串，可能很長） */
  items: string
  /** 外部單號 */
  externalNo: string
}

export type PosFileType = 'item-overview' | 'category-overview' | 'checkout'

export interface ItemOverviewResult {
  type: 'item-overview'
  fileName: string
  rows: ItemOverviewRow[]
  summary: {
    totalItems: number
    totalQuantity: number
    totalRevenue: number
  }
}

export interface CategoryOverviewResult {
  type: 'category-overview'
  fileName: string
  rows: CategoryOverviewRow[]
  summary: {
    totalCategories: number
    totalQuantity: number
    totalRevenue: number
  }
}

export interface CheckoutResult {
  type: 'checkout'
  fileName: string
  rows: CheckoutRow[]
  summary: {
    totalOrders: number
    totalRevenue: number
    /** 付款方式 → 筆數 */
    payMethods: Record<string, number>
  }
}

export type PosParseResult = ItemOverviewResult | CategoryOverviewResult | CheckoutResult

// ── 輔助函式 ─────────────────────────────────────────────────────────────────

/**
 * 將各種格式的數值字串轉成 number
 * 支援：逗號分隔（1,234）、百分比（2.14%）、空字串 → 0
 */
function toNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const str = String(val).replace(/,/g, '').replace(/%$/, '').trim()
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

/**
 * 確保為字串，空值回傳 ''
 */
function toStr(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

/**
 * 將 xlsx 工作表轉成二維陣列（raw 模式）
 * 略過空列
 */
function sheetToRows(sheet: XLSX.WorkSheet): unknown[][] {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })
  return raw as unknown[][]
}

// ── 類型偵測 ─────────────────────────────────────────────────────────────────

/**
 * 根據檔名或第一列欄位自動判斷 POS 檔案類型
 *
 * CRITICAL: 辨識順序：檔名關鍵字 → 第一列欄位數量與內容
 */
function detectFileType(fileName: string, firstRow: unknown[]): PosFileType {
  const lower = fileName.toLowerCase()

  // 優先用檔名判斷
  if (lower.includes('item-overview') || lower.includes('品項銷售') || lower.includes('item_overview')) {
    return 'item-overview'
  }
  if (lower.includes('category-overview') || lower.includes('分類銷售') || lower.includes('category_overview')) {
    return 'category-overview'
  }
  if (lower.includes('checkout') || lower.includes('結帳') || lower.includes('check_out')) {
    return 'checkout'
  }

  // 用欄位數量 + 內容判斷
  const cols = firstRow.filter((c) => c !== '').length

  // item-overview 通常有 8 欄（名稱/商品管理/平均售價/點選率/銷售量/銷售量占比/營業額/營業額占比）
  if (cols >= 7 && cols <= 9) {
    const headers = firstRow.map(toStr)
    if (headers.some((h) => h.includes('平均售價') || h.includes('商品管理'))) {
      return 'item-overview'
    }
    // category-overview 有 6 欄（名稱/點選率/銷售量/銷售量占比/營業額/營業額占比）
    if (headers.some((h) => h.includes('點選率') || h.includes('分類'))) {
      return 'category-overview'
    }
  }

  // 結帳紀錄欄位較多（通常 20+）
  if (cols >= 10 || firstRow.some((c) => toStr(c).includes('發票號碼') || toStr(c).includes('結帳時間'))) {
    return 'checkout'
  }

  // 預設：結帳紀錄
  return 'checkout'
}

// ── 各類型解析器 ──────────────────────────────────────────────────────────────

/**
 * 解析品項銷售概覽（item-overview）
 *
 * iCHEF 匯出格式（第一列為標題）：
 * 名稱 | 商品管理 | 平均售價 | 點選率 | 銷售量 | 銷售量占比 | 營業額 | 營業額占比
 */
function parseItemOverview(rows: unknown[][], fileName: string): ItemOverviewResult {
  // 略過標題列（第 0 列）
  const dataRows = rows.slice(1)

  const parsed: ItemOverviewRow[] = dataRows
    .filter((row) => toStr(row[0]) !== '')
    .map((row) => ({
      name: toStr(row[0]),
      category: toStr(row[1]),
      avgPrice: toNum(row[2]),
      clickRate: toStr(row[3]),
      quantity: toNum(row[4]),
      quantityRate: toStr(row[5]),
      revenue: toNum(row[6]),
      revenueRate: toStr(row[7]),
    }))

  const totalQuantity = parsed.reduce((s, r) => s + r.quantity, 0)
  const totalRevenue = parsed.reduce((s, r) => s + r.revenue, 0)

  return {
    type: 'item-overview',
    fileName,
    rows: parsed,
    summary: {
      totalItems: parsed.length,
      totalQuantity,
      totalRevenue,
    },
  }
}

/**
 * 解析分類銷售概覽（category-overview）
 *
 * iCHEF 匯出格式（第一列為標題）：
 * 名稱 | 點選率 | 銷售量 | 銷售量占比 | 營業額 | 營業額占比
 */
function parseCategoryOverview(rows: unknown[][], fileName: string): CategoryOverviewResult {
  const dataRows = rows.slice(1)

  const parsed: CategoryOverviewRow[] = dataRows
    .filter((row) => toStr(row[0]) !== '')
    .map((row) => ({
      name: toStr(row[0]),
      clickRate: toStr(row[1]),
      quantity: toNum(row[2]),
      quantityRate: toStr(row[3]),
      revenue: toNum(row[4]),
      revenueRate: toStr(row[5]),
    }))

  const totalQuantity = parsed.reduce((s, r) => s + r.quantity, 0)
  const totalRevenue = parsed.reduce((s, r) => s + r.revenue, 0)

  return {
    type: 'category-overview',
    fileName,
    rows: parsed,
    summary: {
      totalCategories: parsed.length,
      totalQuantity,
      totalRevenue,
    },
  }
}

/**
 * 解析結帳紀錄（checkout）
 *
 * iCHEF 欄位（第一列為標題）：
 * (index) | 發票號碼 | 載具 | 結帳時間 | 原始單號 | 外部單號 | 訂單來源 | 訂單種類
 * | 桌號 | 服務費 | 運費 | 折扣金額 | 發票金額 | 支付模組 | 帳本 | 付款資訊
 * | 支付備註 | 目前概況 | 顧客姓名 | 顧客電話 | 標籤備註 | 品項 | 訂購人 | 訂購人電話
 *
 * CRITICAL: 欄位順序固定，index 從 0 開始
 */
function parseCheckout(rows: unknown[][], fileName: string): CheckoutResult {
  // 尋找標題列（包含「發票號碼」或「結帳時間」的那列）
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const r = rows[i].map(toStr)
    if (r.some((c) => c.includes('發票號碼') || c.includes('結帳時間'))) {
      headerRowIdx = i
      break
    }
  }

  const headerRow = rows[headerRowIdx].map(toStr)
  const dataRows = rows.slice(headerRowIdx + 1)

  // 動態尋找欄位 index（防止 iCHEF 改欄位順序）
  function col(keyword: string): number {
    const idx = headerRow.findIndex((h) => h.includes(keyword))
    return idx >= 0 ? idx : -1
  }

  const colInvoice = col('發票號碼')
  const colTime = col('結帳時間')
  const colTable = col('桌號')
  const colSource = col('訂單來源')
  const colDiscount = col('折扣金額')
  const colAmount = col('發票金額')
  const colPayInfo = col('付款資訊')
  const colItems = col('品項')
  const colExternal = col('外部單號')

  const parsed: CheckoutRow[] = dataRows
    .filter((row) => {
      // 過濾空列和合計列
      const timeVal = colTime >= 0 ? toStr(row[colTime]) : ''
      return timeVal !== '' && !toStr(row[0]).includes('合計')
    })
    .map((row) => ({
      invoiceNo: colInvoice >= 0 ? toStr(row[colInvoice]) : '',
      checkoutTime: colTime >= 0 ? toStr(row[colTime]) : '',
      tableNo: colTable >= 0 ? toStr(row[colTable]) : '',
      orderSource: colSource >= 0 ? toStr(row[colSource]) : '',
      discount: colDiscount >= 0 ? toNum(row[colDiscount]) : 0,
      amount: colAmount >= 0 ? toNum(row[colAmount]) : 0,
      payMethod: colPayInfo >= 0 ? toStr(row[colPayInfo]) : '',
      items: colItems >= 0 ? toStr(row[colItems]) : '',
      externalNo: colExternal >= 0 ? toStr(row[colExternal]) : '',
    }))

  // 依結帳時間倒序排列（最新的在上面）
  parsed.sort((a, b) => {
    if (!a.checkoutTime || !b.checkoutTime) return 0
    return b.checkoutTime.localeCompare(a.checkoutTime)
  })

  const totalRevenue = parsed.reduce((s, r) => s + r.amount, 0)

  // 統計付款方式分佈
  const payMethods: Record<string, number> = {}
  for (const row of parsed) {
    const method = row.payMethod || '未知'
    payMethods[method] = (payMethods[method] ?? 0) + 1
  }

  return {
    type: 'checkout',
    fileName,
    rows: parsed,
    summary: {
      totalOrders: parsed.length,
      totalRevenue,
      payMethods,
    },
  }
}

// ── 主要匯出函式 ──────────────────────────────────────────────────────────────

/**
 * 將 File 物件解析為 POS 資料結構
 *
 * 使用範例（Client Component）：
 * ```ts
 * const result = await parsePosFile(file)
 * // result.type === 'item-overview' | 'category-overview' | 'checkout'
 * ```
 *
 * @param file 使用者上傳的 .xlsx 檔案
 * @returns 解析結果，含類型判斷、資料列、摘要
 */
export async function parsePosFile(file: File): Promise<PosParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  // 取第一個工作表
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = sheetToRows(sheet)

  if (rows.length === 0) {
    throw new Error(`${file.name} 是空白檔案`)
  }

  const firstRow = rows[0]
  const fileType = detectFileType(file.name, firstRow)

  switch (fileType) {
    case 'item-overview':
      return parseItemOverview(rows, file.name)
    case 'category-overview':
      return parseCategoryOverview(rows, file.name)
    case 'checkout':
      return parseCheckout(rows, file.name)
  }
}

/**
 * 品項名稱比對：將 iCHEF 品項對應到系統品項
 *
 * 比對邏輯（優先順序）：
 *  1. 完全一致
 *  2. iCHEF 名稱包含系統名稱（或反向）
 *  3. aliases 中有任一完全吻合
 *  4. aliases 中有任一包含關係
 *
 * @param icChefName iCHEF 品項名稱
 * @param systemItems 系統品項列表（來自 /api/items）
 * @returns 第一個匹配的系統品項，或 null
 */
export function matchPosItem(
  icChefName: string,
  systemItems: Array<{ id: number; name: string; aliases: string[]; costPrice: number; sellPrice: number }>
): { id: number; name: string; costPrice: number; sellPrice: number } | null {
  const query = icChefName.trim().toLowerCase()

  for (const item of systemItems) {
    const sysName = item.name.toLowerCase()

    // 完全一致
    if (query === sysName) return item

    // 包含關係
    if (query.includes(sysName) || sysName.includes(query)) return item

    // aliases 比對
    for (const alias of item.aliases ?? []) {
      const a = alias.toLowerCase()
      if (query === a || query.includes(a) || a.includes(query)) return item
    }
  }

  return null
}
