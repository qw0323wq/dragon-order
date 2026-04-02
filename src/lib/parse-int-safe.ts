/**
 * 安全的 parseInt 工具
 * 回傳 number | null，避免 NaN 傳入 SQL 查詢
 */
export function parseIntSafe(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}
