/**
 * 權限系統常數定義
 * 控制各角色可見的頁面
 */

export type AppRole = 'admin' | 'buyer' | 'manager' | 'staff';

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: '管理員',
  buyer: '採購',
  manager: '店長',
  staff: '員工',
};

/** 所有可控制的頁面 */
export const ALL_PAGES = [
  { key: 'dashboard', label: '儀表板', href: '/dashboard' },
  { key: 'orders', label: '訂單管理', href: '/dashboard/orders' },
  { key: 'purchase-plan', label: '採購規劃', href: '/dashboard/purchase-plan' },
  { key: 'suppliers', label: '供應商', href: '/dashboard/suppliers' },
  { key: 'menu', label: '品項管理', href: '/dashboard/menu' },
  { key: 'ingredients', label: '食材中心', href: '/dashboard/ingredients' },
  { key: 'bom', label: 'BOM 配方', href: '/dashboard/bom' },
  { key: 'payments', label: '帳務', href: '/dashboard/payments' },
  // P2-C8: /purchase-orders 已整合到 /orders 的「叫貨單」tab，移除獨立 entry
  // 原 purchase-orders key 保留在 role_permissions 表不移除（DB 資料相容），只是 sidebar 不再顯示
  { key: 'inventory', label: '庫存管理', href: '/dashboard/inventory' },
  { key: 'transfers', label: '調撥/借料', href: '/dashboard/transfers' },
  { key: 'reports', label: '營運報表', href: '/dashboard/reports' },
  { key: 'price-trends', label: '價格走勢', href: '/dashboard/price-trends' },
  { key: 'price-schedule', label: '預約改價', href: '/dashboard/price-schedule' },
  { key: 'import', label: 'POS 匯入', href: '/dashboard/import' },
  { key: 'settings', label: '設定', href: '/dashboard/settings' },
  { key: 'order', label: '叫貨頁', href: '/order' },
] as const;

export type PageKey = (typeof ALL_PAGES)[number]['key'];

/** 預設權限（初始化 role_permissions 表用） */
export const DEFAULT_PERMISSIONS: Record<AppRole, string[]> = {
  admin: ['*'], // 全部頁面
  buyer: ['dashboard', 'orders', 'purchase-plan', 'suppliers', 'menu', 'ingredients', 'bom', 'payments', 'inventory', 'transfers', 'reports', 'price-trends', 'price-schedule', 'order'],
  manager: ['dashboard', 'orders', 'menu', 'payments', 'transfers', 'order'],
  staff: ['order'],
};

/** 檢查某頁面是否在允許清單中 */
export function isPageAllowed(allowedPages: string[], pageKey: string): boolean {
  if (allowedPages.includes('*')) return true;
  return allowedPages.includes(pageKey);
}

/** 將 href 轉成 pageKey */
export function hrefToPageKey(href: string): string | null {
  const page = ALL_PAGES.find((p) => p.href === href);
  return page?.key ?? null;
}

/** 沒設定加成 % 時的系統預設（= 舊 COST_MARKUP 1.2） */
export const DEFAULT_STORE_MARKUP_PCT = 20;

/**
 * 計算店家採購價
 * store_price > 0（手動固定）→ 直接用 store_price
 * 否則 → round(cost_price × (1 + markupPct/100))，每個品項可自訂 markupPct
 *
 * @param markupPct 加成 %（如 20 = +20%）。未提供時用 DEFAULT_STORE_MARKUP_PCT
 */
export function getEffectiveStorePrice(
  costPrice: number,
  storePrice: number,
  markupPct: number = DEFAULT_STORE_MARKUP_PCT
): number {
  if (storePrice > 0) return storePrice;
  const pct = Number.isFinite(markupPct) ? markupPct : DEFAULT_STORE_MARKUP_PCT;
  return Math.round(costPrice * (1 + pct / 100));
}

/** 將 pathname 轉成 pageKey（支援子路由） */
export function pathnameToPageKey(pathname: string): string | null {
  // 精確匹配 /dashboard
  if (pathname === '/dashboard') return 'dashboard';
  // /order 開頭
  if (pathname.startsWith('/order')) return 'order';
  // /dashboard/xxx 匹配
  const match = pathname.match(/^\/dashboard\/([^/]+)/);
  if (match) {
    const sub = match[1];
    const page = ALL_PAGES.find((p) => p.href === `/dashboard/${sub}`);
    return page?.key ?? null;
  }
  return null;
}
