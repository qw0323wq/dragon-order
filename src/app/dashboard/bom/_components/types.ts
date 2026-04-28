/**
 * BOM 配方管理 — 共用型別與常數
 */

export interface Ingredient {
  id: number;
  ingredientName: string;
  quantity: string;
  itemId: number | null;
  itemName: string | null;
  itemUnit: string | null;
  /** 主要顯示成本（按角色：admin/buyer 看 cost_price；manager 看 store_price） */
  itemCost: number;
  /** 總公司進貨價（cost_price），admin/buyer 才會有值 */
  hqCost: number;
  /** 分店採購價（store_price 或 cost_price × markup），admin/buyer/manager 看得到 */
  storeCost: number;
}

export interface MenuItemBom {
  id: number;
  name: string;
  category: string;
  sellPrice: number;
  /** 總公司每份成本（即時算）= SUM(qty × cost_price) */
  hqCost: number;
  /** 總公司毛利率 0-1 */
  hqMargin: number;
  /** 分店每份成本（即時算）= SUM(qty × effectiveStorePrice) */
  storeCost: number;
  /** 分店毛利率 0-1 */
  storeMargin: number;
  /** 有食材沒對到 items 表 → 成本可能不準 */
  hasUnknownIngredient: boolean;
  notes: string | null;
  isActive: boolean;
  ingredients: Ingredient[];
}

export interface IngredientForm {
  ingredientName: string;
  quantity: string;
  itemId: number | null;
}

export interface BomFormData {
  name: string;
  category: string;
  sellPrice: number;
  notes: string;
  ingredients: IngredientForm[];
}

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

export const EMPTY_FORM: BomFormData = {
  name: "",
  category: "",
  sellPrice: 0,
  notes: "",
  ingredients: [{ ingredientName: "", quantity: "", itemId: null }],
};
