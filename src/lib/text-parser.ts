/**
 * 文字模式叫貨解析器
 * 輸入自然語言文字，解析出品項名稱和數量
 */

import type { MenuItem } from "./mock-data";

export interface ParsedLine {
  /** 原始輸入行 */
  raw: string;
  /** 匹配到的品項（null 表示無法辨識） */
  item: MenuItem | null;
  /** 解析出的數量 */
  quantity: number;
  /** 解析信心度 0-1 */
  confidence: number;
  /** 辨識失敗的原因 */
  errorReason?: string;
}

/**
 * 從文字行解析數量
 * 支援格式：「五花 10斤」、「白蝦5包」、「蝦 x3」等
 */
function parseQuantity(text: string): number {
  // 先嘗試匹配中文數字+單位
  const chineseNum: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };

  // 匹配阿拉伯數字（含小數）
  const arabicMatch = text.match(/[xX×*]?\s*(\d+\.?\d*)/);
  if (arabicMatch) {
    const num = parseFloat(arabicMatch[1]);
    if (!isNaN(num) && num > 0) return num;
  }

  // 匹配中文數字
  for (const [ch, val] of Object.entries(chineseNum)) {
    if (text.includes(ch)) return val;
  }

  return 1; // 預設數量為 1
}

/**
 * 解析整段叫貨文字
 * 每行視為一個品項請求
 */
export function parseOrderText(
  text: string,
  items: MenuItem[]
): ParsedLine[] {
  const lines = text
    .split(/[\n,，;；]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.map((line) => parseOneLine(line, items));
}

/**
 * 解析單行文字，嘗試匹配品項
 */
function parseOneLine(line: string, items: MenuItem[]): ParsedLine {
  const lowerLine = line.toLowerCase();

  let bestMatch: MenuItem | null = null;
  let bestScore = 0;

  for (const item of items) {
    // 嘗試完整品項名稱匹配
    if (lowerLine.includes(item.name.toLowerCase())) {
      const score = item.name.length / line.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    // 嘗試別名匹配
    for (const alias of item.aliases) {
      if (lowerLine.includes(alias.toLowerCase())) {
        // 別名越長越精確，信心度越高
        const score = alias.length / line.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }
    }
  }

  if (bestMatch) {
    return {
      raw: line,
      item: bestMatch,
      quantity: parseQuantity(line),
      // CRITICAL: confidence 影響 UI 顯示（低信心度顯示橘色警告）
      confidence: Math.min(0.95, bestScore + 0.3),
    };
  }

  return {
    raw: line,
    item: null,
    quantity: 1,
    confidence: 0,
    errorReason: "無法辨識品項，請手動選擇",
  };
}
