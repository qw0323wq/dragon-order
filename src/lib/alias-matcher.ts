/**
 * 品項別稱匹配模組 — 叫貨文字解析核心
 *
 * 功能：將「五花10斤、蝦5包」這類自然語言解析成結構化叫貨品項
 *
 * 匹配優先順序：
 * 1. Exact match（完全相等，含別稱）→ confidence 1.0
 * 2. Contains match（包含關係）→ confidence 0.8
 * 3. Fuzzy match（共用字元比例）→ confidence 0.5 ~ 0.7
 * 4. 無匹配 → confidence 0
 *
 * CRITICAL: 此模組是文字叫貨模式的入口，匹配準確度直接影響採購正確性
 * 若需調整閾值，同步更新 FUZZY_THRESHOLD 常數並在測試中驗證
 */

/** 模糊匹配的最低接受閾值（低於此值視為無匹配） */
const FUZZY_THRESHOLD = 0.4;

/** 已知的數量單位清單（用於正則匹配） */
const QUANTITY_UNITS = ['斤', '包', '顆', '盒', '瓶', '箱', 'kg', 'g', '份', '塊', '條', '把', '束', '袋'];

/** 解析後的單一品項結果 */
export interface MatchedItem {
  itemId: number;
  itemName: string;
  quantity: number;
  unit: string;
  /** 匹配信心度 0~1，0 表示未匹配到 */
  confidence: number;
  /** 原始輸入片段，供前端顯示確認用 */
  rawInput: string;
}

/** 傳入的品項資料（來自 DB） */
export interface ItemCandidate {
  id: number;
  name: string;
  unit: string;
  aliases: string[];
}

// ─────────────────────────────────────────────
// 內部工具函式
// ─────────────────────────────────────────────

/**
 * 計算兩個字串的字元重疊比例（Dice coefficient 簡化版）
 * 用中文字的集合交集除以平均長度
 */
function fuzzyScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  let intersection = 0;
  setA.forEach((char) => {
    if (setB.has(char)) intersection++;
  });

  // Dice coefficient：2 * |intersection| / (|A| + |B|)
  return (2 * intersection) / (setA.size + setB.size);
}

/**
 * 對單一品項名稱，找出最匹配的候選品項
 * @param rawName 從文字中提取的品項名
 * @param candidates 品項清單（來自 DB）
 * @returns 最佳匹配結果（含 confidence）
 */
function findBestMatch(
  rawName: string,
  candidates: ItemCandidate[]
): { item: ItemCandidate; confidence: number } | null {
  let bestItem: ItemCandidate | null = null;
  let bestScore = 0;

  for (const item of candidates) {
    // 1. Exact match — name 完全相等
    if (item.name === rawName) {
      return { item, confidence: 1.0 };
    }

    // 2. Exact match — 任一 alias 完全相等
    if (item.aliases.includes(rawName)) {
      return { item, confidence: 1.0 };
    }

    // 3. Contains match — 品項名包含輸入，或輸入包含品項名
    const nameContains =
      item.name.includes(rawName) || rawName.includes(item.name);
    const aliasContains = item.aliases.some(
      (alias) => alias.includes(rawName) || rawName.includes(alias)
    );

    if (nameContains || aliasContains) {
      const score = 0.8;
      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
      continue;
    }

    // 4. Fuzzy match — 字元重疊比例
    let maxFuzzy = fuzzyScore(rawName, item.name);
    for (const alias of item.aliases) {
      const s = fuzzyScore(rawName, alias);
      if (s > maxFuzzy) maxFuzzy = s;
    }

    if (maxFuzzy >= FUZZY_THRESHOLD && maxFuzzy > bestScore) {
      bestScore = maxFuzzy * 0.7; // fuzzy 最高給 0.7 * score（反映不確定性）
      bestItem = item;
    }
  }

  if (!bestItem || bestScore === 0) return null;
  return { item: bestItem, confidence: Math.round(bestScore * 100) / 100 };
}

// ─────────────────────────────────────────────
// 主要解析函式
// ─────────────────────────────────────────────

/**
 * 將自然語言叫貨文字解析為結構化品項列表
 *
 * 支援格式：
 * - 「五花10斤、蝦5包、霜降牛3斤」
 * - 「五花 10斤\n蝦 5包」（換行分隔）
 * - 「五花10、蝦5包」（無單位時使用品項預設單位）
 *
 * @param text 使用者輸入的叫貨文字
 * @param items 品項清單（從 DB 查詢，需含 aliases）
 * @returns 解析結果陣列，confidence=0 的表示未匹配
 */
export function parseOrderText(
  text: string,
  items: ItemCandidate[]
): MatchedItem[] {
  if (!text.trim()) return [];

  // 1. 用中文逗號、頓號、換行、多空格分割成片段
  const segments = text
    .split(/[，,、\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const results: MatchedItem[] = [];

  for (const segment of segments) {
    // 2. 用正則提取品項名、數量、單位
    //    格式：<中文/英文名稱> <數字> <可選單位>
    //    範例：「五花10斤」「霜降牛 3.5 斤」「可樂2箱」
    const unitPattern = QUANTITY_UNITS.join('|');
    const regex = new RegExp(
      `^([\\u4e00-\\u9fff\\w\\s]+?)\\s*(\\d+(?:\\.\\d+)?)\\s*(${unitPattern})?$`
    );

    const match = segment.match(regex);

    if (!match) {
      // 無法解析的片段，回傳 unmatched 項目
      results.push({
        itemId: -1,
        itemName: '',
        quantity: 0,
        unit: '',
        confidence: 0,
        rawInput: segment,
      });
      continue;
    }

    const rawName = match[1].trim();
    const quantity = parseFloat(match[2]);
    const rawUnit = match[3] ?? null;

    // 3. 找最匹配的品項
    const matchResult = findBestMatch(rawName, items);

    if (!matchResult) {
      results.push({
        itemId: -1,
        itemName: rawName,
        quantity,
        unit: rawUnit ?? '',
        confidence: 0,
        rawInput: segment,
      });
      continue;
    }

    const { item, confidence } = matchResult;

    results.push({
      itemId: item.id,
      itemName: item.name,
      // 優先用輸入中的單位；沒寫單位則使用品項預設單位
      quantity,
      unit: rawUnit ?? item.unit,
      confidence,
      rawInput: segment,
    });
  }

  return results;
}

/**
 * 過濾出有把握的匹配結果（confidence >= 閾值）
 * @param results parseOrderText 的輸出
 * @param minConfidence 最低信心度（預設 0.5）
 */
export function filterConfident(
  results: MatchedItem[],
  minConfidence = 0.5
): { confident: MatchedItem[]; uncertain: MatchedItem[] } {
  const confident: MatchedItem[] = [];
  const uncertain: MatchedItem[] = [];

  for (const r of results) {
    if (r.confidence >= minConfidence) {
      confident.push(r);
    } else {
      uncertain.push(r);
    }
  }

  return { confident, uncertain };
}
