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

/** Date → YYYY-MM 字串 */
export function formatMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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
