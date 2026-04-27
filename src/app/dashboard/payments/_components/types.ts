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

export interface MonthlyReport {
  month: string;
  storeId: number | null;
  storeInfo: StoreInfo | null;
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
