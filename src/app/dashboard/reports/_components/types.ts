/** 報表中心共用型別 */

// ── B2 消耗報表 ──
export interface ConsumptionItem {
  itemId: number; itemName: string; category: string; unit: string
  theoreticalQty: number; actualQty: number; diff: number; wasteRate: number | null
}
export interface ConsumptionData {
  items: ConsumptionItem[]
  summary: { totalItems: number; avgWasteRate: number; highWaste: number }
}

// ── B3 叫貨建議 ──
export interface SuggestionItem {
  itemId: number; name: string; category: string; unit: string
  currentStock: number; safetyStock: number; suggestedQty: number; estimatedCost: number
}
export interface SupplierSuggestion {
  supplierId: number; supplierName: string; items: SuggestionItem[]; totalCost: number
}
export interface SuggestionData {
  suppliers: SupplierSuggestion[]
  summary: { totalSuppliers: number; totalItems: number; totalEstimatedCost: number }
}

// ── B4 歷史比較 ──
export interface ComparisonItem {
  itemId: number; name: string; category: string; unit: string; supplier: string
  period1Qty: number; period2Qty: number; diff: number; changeRate: number; isAnomaly: boolean
}
export interface ComparisonData {
  period1: { from: string; to: string }
  period2: { from: string; to: string }
  items: ComparisonItem[]
  summary: { totalItems: number; anomalies: number; increased: number; decreased: number }
}

// ── B5 供應商評分 ──
export interface SupplierScore {
  supplierId: number; supplierName: string; supplierCategory: string
  totalPOs: number; completedPOs: number; totalReceiving: number
  scores: { quality: number; delivery: number; completion: number; overall: number }
  issues: { qualityIssues: number; shortages: number; missing: number }
  payment: { totalPaid: number; paidCount: number }
}
export interface ScoreData {
  suppliers: SupplierScore[]
  summary: { totalSuppliers: number; avgScore: number; lowScore: number }
}

// ── C3 調撥對帳 ──
export interface SettlementPair {
  fromStoreName: string; toStoreName: string; totalAmount: number; totalReturned: number
  items: Array<{ transferNumber: string; itemName: string; quantity: number; returnedQty: number; netQty: number; amount: number }>
}
export interface SettlementEntry { store1: string; store2: string; net: number; direction: string }
export interface SettlementData {
  month: string; pairs: SettlementPair[]; settlement: SettlementEntry[]
  summary: { totalTransfers: number; totalAmount: number }
}

// ── C4 集團報表 ──
export interface GroupData {
  period: { from: string; to: string }
  storeSpending: Array<{ store_name: string; order_count: number; total_amount: number; percentage: number }>
  topItems: Array<{ name: string; category: string; supplier_name: string; total_qty: number; total_amount: number }>
  categoryCost: Array<{ category: string; total_amount: number; percentage: number }>
  supplierSpending: Array<{ name: string; total_amount: number; order_count: number }>
  summary: { grandTotal: number; storeCount: number; totalOrders: number }
}

export type TabKey = 'suggestions' | 'consumption' | 'comparison' | 'scores' | 'settlement' | 'group'
