/**
 * BOM 成本單位換算 — 單一事實來源
 *
 * 問題背景：BOM 用量單位 (bom_items.quantity_unit, 如 "g") 與供應商 SKU 的
 * 計價單位 (items.unit, 如 "公斤") 常不一致。成本必須先把用量換算成 SKU 計價
 * 單位再乘單價，否則「150g × 每公斤價」會放大 1000 倍。
 * （根因與修復設計見 memory: project_dragon_order_bom_unit_bug）
 *
 * 統一模型：成本 = quantity_value × factor × cost_price
 *   factor = 把 1 個 BOM 用量單位換算成幾個 SKU 計價單位
 */

// CRITICAL: 台灣餐飲慣例 — 台斤 = 斤 = 600g（非大陸市斤 500g）；公斤 = 1000g；兩 = 37.5g
// 移除／改動任一數值會直接讓對應食材的成本算錯（毛利連帶爆掉）。
const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1, 公克: 1, 克: 1, gram: 1, grams: 1,
  kg: 1000, 公斤: 1000, 千克: 1000,
  台斤: 600, 斤: 600, 台觔: 600,
  兩: 37.5,
};

/**
 * 從單位字串抓「每單位公克數」。非重量單位（顆/包/瓶…）回 null。
 * 容忍雜訊字尾，如 "g(2小包)"、"g~150g" → 視為 g。
 */
export function unitToGrams(unitRaw: string | null | undefined): number | null {
  if (!unitRaw) return null;
  const u = unitRaw.trim();
  if (u in UNIT_TO_GRAMS) return UNIT_TO_GRAMS[u];
  // 開頭匹配（處理帶雜訊字尾的用量單位）
  if (/^(公克|克|gram)/i.test(u)) return 1;
  if (/^g(?![a-uw-z])/i.test(u)) return 1; // g 開頭但不是 "gram" 以外的英文字（避免誤判）
  if (/^(公斤|千克|kg)/i.test(u)) return 1000;
  if (/^(台斤|台觔|斤)/.test(u)) return 600;
  return null;
}

export type FactorKind = "match" | "weight" | "manual" | "mismatch";

export interface UnitFactor {
  /** quantity_value × factor = 換算成 item.unit 的量。mismatch 時 factor = 0 */
  factor: number;
  /**
   * match    — 單位一致（含空單位視為整份），係數 1
   * weight   — 兩邊都是重量，用公克比例換算
   * manual   — 跨維度，用 cost_factor 人工/預填係數
   * mismatch — 跨維度但沒係數，無法換算（呼叫端應 flag 並排除成本）
   */
  kind: FactorKind;
}

/**
 * 決定「BOM 用量 → SKU 計價單位」的換算係數。
 *
 * @param bomUnit    bom_items.quantity_unit（可能為 null/空/帶雜訊）
 * @param itemUnit   items.unit（SKU 計價單位）
 * @param costFactor bom_items.cost_factor（跨維度人工係數；null = 未設）
 */
export function resolveUnitFactor(
  bomUnit: string | null | undefined,
  itemUnit: string | null | undefined,
  costFactor: number | null | undefined
): UnitFactor {
  const b = (bomUnit ?? "").trim();
  const i = (itemUnit ?? "").trim();

  // 0) BOM 沒填單位 → 視為「整份 SKU 單位」（如飲料用量 "1瓶"），係數 1。
  //    這保留飲料/酒的既有正確行為，不可拿掉。
  if (!b) return { factor: 1, kind: "match" };

  // 1) 兩邊都是重量 → 公克比例（最常見）。同重量單位比例為 1 → match。
  const bg = unitToGrams(b);
  const ig = unitToGrams(i);
  if (bg != null && ig != null) {
    return { factor: bg / ig, kind: bg === ig ? "match" : "weight" };
  }

  // 2) 單位字串完全相同（瓶→瓶、顆→顆）→ 係數 1。
  if (i && b === i) return { factor: 1, kind: "match" };

  // 3) 有跨維度人工係數 → 用它（顆→包、片→塊、g→包…）。
  if (costFactor != null && Number.isFinite(costFactor) && costFactor > 0) {
    return { factor: costFactor, kind: "manual" };
  }

  // 4) 跨維度但沒係數 → 無法換算。呼叫端標 hasUnitMismatch 並排除成本，
  //    誠實顯示「單位待設定」，勝過顯示放大數百倍的假毛利。
  return { factor: 0, kind: "mismatch" };
}
