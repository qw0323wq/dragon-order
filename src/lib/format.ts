/**
 * 共用格式化工具 — 金額、日期、月份
 *
 * CRITICAL: 不要在各頁面重複定義 fmtAmount/formatMonth，統一用這裡的
 */

/** 格式化金額（加千分位） — $1,234 */
export function formatCurrency(n: number): string {
  return `$${n.toLocaleString("zh-TW")}`;
}

/** 格式化金額（無 $ 符號） — 1,234 */
export function formatAmount(n: number): string {
  return n.toLocaleString("zh-TW");
}

/**
 * 浮點誤差修正 — 把金額四捨五入到 2 位小數
 *
 * JS 的 0.1 + 0.2 = 0.30000000000000004，多筆累加會更糟。
 * 把累加結果包一層 roundMoney() 即可消除誤差。
 */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 客戶端金額聚合 — 用「分」整數累加避免浮點誤差
 *
 * 用法：
 *   sumBy(orders, o => o.subtotal)           // 一層欄位
 *   sumBy(orders, o => o.qty * o.unitPrice)  // 計算式
 *
 * 後端 SQL SUM 已精準（PostgreSQL numeric 是 decimal）— 不需要這個 helper。
 */
export function sumBy<T>(arr: T[], getter: (item: T) => number): number {
  const cents = arr.reduce((sum, item) => sum + Math.round(getter(item) * 100), 0);
  return cents / 100;
}

/** Date → YYYY-MM 字串 */
export function formatMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Date → 'YYYY-MM-DD'（本地時區，預設現在）
 *
 * CRITICAL: 不要用 toISOString().slice(0, 10)
 * 因為 toISOString 永遠回 UTC，台北 UTC+8 會差 0~1 天：
 *   - 取今天：凌晨 0-8 點會回到「昨天日期」
 *   - setDate 加減：右箭頭看起來沒反應、左箭頭跳兩天
 * 統一用此函數確保拿到的是台北日期。
 */
export function formatDateLocal(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM → 顯示用的 "2026年3月" */
export function formatMonthDisplay(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${parseInt(m)}月`;
}

/** YYYY-MM 加減月份 */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return formatMonth(d);
}
