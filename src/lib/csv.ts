/**
 * CSV 匯出工具 — 純前端產生檔案（不經後端）
 *
 * 用法：
 *   const csv = toCsv(rows, ['品項', '數量'])
 *   downloadCsv('消耗報表_2026-03.csv', csv)
 */

/**
 * UTF-8 BOM
 *
 * CRITICAL: 中文 CSV 一定要有 BOM，否則 Excel 會用系統預設編碼（繁中 Windows = Big5）
 * 去解 UTF-8 位元組，整份檔案的中文變亂碼。移除這個常數 = 老闆打開報表看到亂碼。
 */
const UTF8_BOM = "\uFEFF";

/** 換行用 CRLF — RFC 4180 規定，Excel / Numbers 相容性最好 */
const CRLF = "\r\n";

/** 需要跳脫的字元：逗號（欄位分隔）、雙引號（跳脫字元本身）、CR/LF（列分隔） */
const NEEDS_QUOTING = /[",\r\n]/;

/**
 * 公式注入前綴 — Excel 看到這些開頭會把儲存格當公式執行
 * 參考：OWASP CSV Injection
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** CSV 儲存格可接受的值型別 */
export type CsvValue = string | number | null | undefined;

/**
 * 單一儲存格跳脫
 *
 * CRITICAL: 含逗號/雙引號/換行的值沒包雙引號，會把欄位切斷、整份表格從那一列開始錯位。
 * 規則（RFC 4180）：整個值用雙引號包起來，值裡面的每個雙引號變成兩個。
 *
 * 另外對「字串」做公式注入防護（數字不動，否則 -5 會被加引號而失去數值型別）。
 */
export function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  // 只有字串需要防公式注入；數字要保持 Excel 可計算的原樣
  const raw = typeof value === "string" && FORMULA_PREFIX.test(value) ? `'${value}` : String(value);

  if (NEEDS_QUOTING.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * 二維資料 → CSV 字串（含表頭列，不含 BOM）
 *
 * BOM 由 downloadCsv 在寫檔時加上，讓 toCsv 的輸出保持乾淨、好測試。
 *
 * @param rows 資料列，每列的欄位順序需與 headers 對應
 * @param headers 表頭文字
 */
export function toCsv(rows: readonly CsvValue[][], headers: readonly string[]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(","));
  return lines.join(CRLF);
}

/**
 * 觸發瀏覽器下載 CSV 檔（client-only）
 *
 * @param filename 檔名，需自帶 .csv 副檔名
 * @param csv toCsv() 產生的字串
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([UTF8_BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 立即釋放，避免 blob 留在記憶體直到分頁關閉
  URL.revokeObjectURL(url);
}
