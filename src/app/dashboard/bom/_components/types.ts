/**
 * BOM 配方管理 — 共用型別與常數
 */

export interface Ingredient {
  id: number;
  /** 三層架構：BOM 行對應的 ingredient 主檔 id */
  ingredientId: number | null;
  ingredientName: string;
  /** 原文用量字串（如 "150g"） */
  quantity: string;
  /** 拆出的數值（如 150） */
  quantityValue: number | null;
  /** 拆出的單位（如 "g"） */
  quantityUnit: string | null;
  /** 用於成本計算的供應商來源 id（主家 or fallback 舊 item_id） */
  itemId: number | null;
  itemName: string | null;
  itemUnit: string | null;
  /** 主要顯示成本（按角色：admin/buyer 看 cost_price；manager 看 store_price） */
  itemCost: number;
  /** 總公司進貨價（cost_price），admin/buyer 才會有值 */
  hqCost: number;
  /** 分店採購價（store_price 或 cost_price × markup），admin/buyer/manager 看得到 */
  storeCost: number;
  /** 同 ingredient 對應幾家 active 供應商 */
  supplierCount: number;
  /** 成本來源：'primary' (主家) | 'fallback' (舊 item_id) | 'none' (無對應) */
  priceSource: "primary" | "fallback" | "none";
  /** 單位換算種類：match(一致)|weight(重量比例)|manual(人工係數)|mismatch(跨維度待設定) */
  factorKind: "match" | "weight" | "manual" | "mismatch";
  /** true = 此行 BOM 單位與 SKU 計價單位跨維度、無係數，成本已從菜品排除 */
  unitMismatch: boolean;
}

export interface MenuItemBom {
  id: number;
  name: string;
  category: string;
  /** 賣給客人的售價（分店端） */
  sellPrice: number;
  /** 總公司向供應商進貨成本 = SUM(qty × cost_price) */
  hqCost: number;
  /** 總公司賣給分店的收入 = SUM(qty × effectiveStorePrice) */
  hqRevenue: number;
  /** 總公司毛利率 = (hqRevenue - hqCost) / hqRevenue */
  hqMargin: number;
  /** 分店向總公司採購成本 = hqRevenue（同一段轉手價） */
  storeCost: number;
  /** 分店毛利率 = (sellPrice - storeCost) / sellPrice */
  storeMargin: number;
  /** 有食材沒對到 items 表 → 成本可能不準 */
  hasUnknownIngredient: boolean;
  /** 有食材 BOM 單位與 SKU 計價單位跨維度、未設換算 → 成本不完整（待設定單位） */
  hasUnitMismatch: boolean;
  notes: string | null;
  isActive: boolean;
  ingredients: Ingredient[];
}

export interface IngredientForm {
  /** 三層架構：BOM 行綁定的 ingredient 主檔 id（食材本位） */
  ingredientId: number | null;
  /** 食材顯示名稱（從 ingredient.name 帶過來） */
  ingredientName: string;
  quantity: string;
  /** 向下相容：舊 BOM 行可能用 item_id 不用 ingredient_id */
  itemId: number | null;
}

export interface BomFormData {
  name: string;
  category: string;
  sellPrice: number;
  notes: string;
  ingredients: IngredientForm[];
}

/** Ingredient 下拉選擇器用 — 從 /api/ingredients 拉 */
export interface IngredientOption {
  id: number;
  name: string;
  category: string | null;
  unit: string;
  supplierCount: number;
  primaryItemName: string | null;
  primarySupplierName: string | null;
  primaryCost: number | null;
  menuUseCount: number;
}

/** 舊 ItemOption 保留作向下相容（食材中心新版用 IngredientOption） */
export interface ItemOption {
  id: number;
  name: string;
  unit: string;
  costPrice: number;
  category: string;
}

export const BOM_CATEGORIES = [
  "鍋底",
  "肉品",
  "海鮮",
  "火鍋料",
  "特色",
  "蔬菜",
  "飲料",
  "酒類",
];

export const CATEGORY_COLORS: Record<string, string> = {
  鍋底: "bg-red-100 text-red-700",
  肉品: "bg-amber-100 text-amber-700",
  海鮮: "bg-blue-100 text-blue-700",
  火鍋料: "bg-orange-100 text-orange-700",
  特色: "bg-pink-100 text-pink-700",
  蔬菜: "bg-green-100 text-green-700",
  飲料: "bg-purple-100 text-purple-700",
  酒類: "bg-violet-100 text-violet-700",
};

/**
 * 毛利門檻（單一事實來源）— 顯示配色與篩選器共用，避免「顯示紅、篩選卻歸類正常」的矛盾。
 * 分店毛利是主要決策層：< 45% 紅（偏低易賠）、45~60% 黃、≥ 60% 綠（賺錢主力）。
 * 總公司毛利結構性偏低（轉手僅加成 ~20%），另用 HQ_LOW 當「低毛利」篩選門檻。
 */
export const MARGIN_THRESHOLDS = {
  STORE_LOW: 0.45,
  STORE_HIGH: 0.6,
  HQ_LOW: 0.2,
} as const;

export const EMPTY_FORM: BomFormData = {
  name: "",
  category: "",
  sellPrice: 0,
  notes: "",
  ingredients: [{ ingredientId: null, ingredientName: "", quantity: "", itemId: null }],
};
