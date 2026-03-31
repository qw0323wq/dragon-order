/** 使用者資料型別 */
export interface UserData {
  id: number;
  name: string;
  employeeId: string;
  phone: string | null;
  role: string;
  storeId: number | null;
  storeName: string | null;
  hasApiToken: boolean;
  isActive: boolean;
  createdAt: string;
  allowedSuppliers: number[];
}

/** 供應商資料型別（叫貨權限用） */
export interface SupplierOption {
  id: number;
  name: string;
  category: string;
}

/** 門市資料型別 */
export interface StoreData {
  id: number;
  name: string;
  companyName: string | null;
  taxId: string | null;
  address: string;
  hours: string;
  manager: string | null;
  phone: string | null;
}

/** 角色權限資料 */
export interface RolePermission {
  role: string;
  allowedPages: string[];
}

/** 角色中文對照 */
export const ROLE_LABELS: Record<string, string> = {
  admin: "管理員",
  buyer: "採購",
  manager: "店長",
  staff: "員工",
  owner: "管理員",
};

/** 角色 Badge 顏色 */
export const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  buyer: "bg-purple-100 text-purple-700",
  manager: "bg-blue-100 text-blue-700",
  staff: "bg-gray-100 text-gray-700",
  owner: "bg-red-100 text-red-700",
};

/** 所有可控制的頁面（權限管理用） */
export const PAGE_OPTIONS = [
  { key: "dashboard", label: "儀表板" },
  { key: "orders", label: "訂單管理" },
  { key: "suppliers", label: "供應商" },
  { key: "menu", label: "品項管理" },
  { key: "bom", label: "BOM 配方" },
  { key: "payments", label: "帳務" },
  { key: "import", label: "POS 匯入" },
  { key: "settings", label: "設定" },
  { key: "order", label: "叫貨頁" },
];
