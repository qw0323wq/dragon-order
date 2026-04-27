// ── 訂單管理共用型別 + 常數 ──

export interface POItem {
  id: number;
  itemName: string;
  itemUnit: string;
  storeName: string;
  quantity: string;
  notes: string | null;
  costPrice: number;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierName: string;
  supplierCategory: string;
  status: string;
  totalAmount: number;
  items: POItem[];
}

export interface OrderDetail {
  id: number
  quantity: string
  unit: string
  unitPrice: number
  subtotal: number
  notes: string | null
  itemName: string
  itemCategory: string
  supplierName: string
  supplierId: number
  storeName: string
  storeId: number
  createdById?: number | null
  createdByName?: string | null
  supplierNotes?: string | null
  // ── 驗收相關（/api/orders/[id] join receiving 帶出，未驗收則為 null） ──
  receivedQty?: string | null
  returnedQty?: string | null
  receivingResult?: string | null
  /** 應付小計：未驗收 → null；已驗收 → (received - returned) × unitPrice，未到貨 → 0 */
  actualSubtotal?: number | null
}

export interface Order {
  id: number
  orderDate: string
  status: string
  totalAmount: number
  notes: string | null
  createdByName: string | null
}

export interface ReceivingRecord {
  id: number
  orderItemId: number
  receivedQty: string
  /** 退貨數量（部分品質問題用，預設 '0'；整批退時 = receivedQty） */
  returnedQty: string
  result: string
  issue: string | null
  receivedAt: string | null
}

export interface ReceivingInput {
  receivedQty: string
  /** 退貨數量；result='品質問題' 時才會用到 */
  returnedQty: string
  result: string
  issue: string
}

export interface SupplierPaymentInfo {
  supplierId: number
  supplierName: string
  paymentType: string
  /** 採購金額 = SUM(訂單明細 subtotal) */
  totalAmount: number
  /** 應付金額 = SUM(actualSubtotal)；該供應商未全部驗收時為 null（前端顯示「-」） */
  payableAmount: number | null
  isPaid: boolean
}

// ── 狀態中文對照 ──

export const STATUS_LABELS: Record<string, string> = {
  draft: '編輯中',
  submitted: '已送出',
  ordered: '已叫貨',
  receiving: '待驗收',
  received: '已驗收',
  closed: '已結案',
  cancelled: '已取消',
  // 向下相容
  confirmed: '已確認',
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-700',
  submitted: 'bg-blue-100 text-blue-700',
  ordered: 'bg-purple-100 text-purple-700',
  receiving: 'bg-orange-100 text-orange-700',
  received: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
  confirmed: 'bg-blue-100 text-blue-700',
}

export const RESULT_OPTIONS = ['正常', '短缺', '品質問題', '未到貨']

// ── 日期工具 ──

/**
 * 格式化 Date → 'YYYY-MM-DD'（本地時區，不用 UTC）
 *
 * CRITICAL: 不能用 toISOString().slice(0, 10)
 * 因為 toISOString 永遠回 UTC，台北 UTC+8：
 *   new Date('2026-04-23T00:00:00') → 台北 4/23 00:00 = UTC 4/22 16:00
 *   .toISOString() = '2026-04-22T16:00:00Z'
 *   .slice(0, 10) = '2026-04-22' ← 跳到前一天！
 * setDate(+1) 後 toISOString 還沒過台北 0:00 → addDays 等於沒加。
 */
export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}（週${weekdays[d.getDay()]}）`
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

// ── 輔助函式 ──

export function groupBySupplier(details: OrderDetail[]): Map<string, OrderDetail[]> {
  const map = new Map<string, OrderDetail[]>()
  for (const d of details) {
    if (!map.has(d.supplierName)) map.set(d.supplierName, [])
    map.get(d.supplierName)!.push(d)
  }
  return map
}

export function buildOrderText(items: OrderDetail[]): string {
  const byStore = new Map<string, OrderDetail[]>()
  for (const item of items) {
    if (!byStore.has(item.storeName)) byStore.set(item.storeName, [])
    byStore.get(item.storeName)!.push(item)
  }

  const sections: string[] = []
  for (const [storeName, storeItems] of byStore) {
    const lines = [`叫貨店家：${storeName}`]
    for (const item of storeItems) {
      const qty = parseFloat(item.quantity)
      const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
      let line = `${item.itemName}${qtyStr}${item.unit}`
      if (item.supplierNotes) line += `（${item.supplierNotes}）`
      lines.push(line)
    }
    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}
