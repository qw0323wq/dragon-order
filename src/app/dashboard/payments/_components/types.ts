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
  totalAmount: number;
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
    totalAmount: number;
    paidAmount: number;
    unpaidAmount: number;
  };
}

/** 'hq' 代表總公司，數字字串代表門市 ID */
export type ActiveTab = 'hq' | string;
