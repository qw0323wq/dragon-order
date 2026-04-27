/**
 * 帳務管理 — 共用型別
 */

export interface StoreInfo {
  id: number;
  name: string;
  companyName: string | null;
  taxId: string | null;
}

export interface Store extends StoreInfo {
  address: string | null;
  hours: string | null;
  manager: string | null;
  phone: string | null;
  sortOrder: number;
  type: string;
}

export interface SupplierPaymentReport {
  supplierId: number;
  supplierName: string;
  paymentType: string;
  orderCount: number;
  /** 該供應商總品項數（用於判斷是否完全驗收） */
  itemCount: number;
  /** 已驗收品項數 */
  receivedItemCount: number;
  /** 是否完全驗收（payableAmount 才有意義） */
  fullyReceived: boolean;
  /** 採購金額 = SUM(訂單明細 subtotal) */
  totalAmount: number;
  /** 應付金額 = SUM(actualSubtotal)；fullyReceived=false 時為 null */
  payableAmount: number | null;
  paidAmount: number;
  pendingAmount: number;
  unpaidAmount: number;
  payments: Array<{
    id: number;
    status: string;
    amount: number;
    paidAt: string | null;
  }>;
}

/**
 * 訂單×供應商組合的付款明細
 *
 * 一張訂單可能跨多家供應商，所以「訂單×供應商」才是結帳單位
 * (orderId, supplierId) 是 unique key，對應 payments 表的一筆 row
 */
export interface OrderPaymentRow {
  orderId: number;
  /** YYYY-MM-DD */
  orderDate: string;
  supplierId: number;
  supplierName: string;
  paymentType: string;
  itemCount: number;
  receivedItemCount: number;
  /** 該訂單×供應商的所有品項都驗收完才為 true */
  fullyReceived: boolean;
  /** 採購金額（訂購量 × 單價） */
  totalAmount: number;
  /** 應付金額（按實收 - 退貨）；fullyReceived=false 時為 null */
  payableAmount: number | null;
  /** payments 表的 row id（沒紀錄時為 null） */
  paymentId: number | null;
  /** 'unpaid' | 'pending' | 'paid' */
  paymentStatus: string;
  /** 已付金額（status=paid 時填寫） */
  paidAmount: number;
  /** 匯款日期 'YYYY-MM-DD'（本地時區） */
  paidAt: string | null;
  paymentNotes: string | null;
}

export interface MonthlyReport {
  month: string;
  storeId: number | null;
  storeInfo: StoreInfo | null;
  /** 訂單×供應商明細（核心操作單位） */
  orders: OrderPaymentRow[];
  /** 供應商聚合（總覽 + 列印對帳單用） */
  suppliers: SupplierPaymentReport[];
  summary: {
    /** 採購金額（按訂購量） */
    totalAmount: number;
    /** 應付金額（按實收 - 退貨；未驗收的部分 fallback totalAmount） */
    payableAmount: number;
    paidAmount: number;
    unpaidAmount: number;
  };
}

/** 'hq' 代表總公司，數字字串代表門市 ID */
export type ActiveTab = 'hq' | string;
