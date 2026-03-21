/**
 * Mock 資料（DB 未接通前使用）
 * 正式版替換成 Supabase / Drizzle ORM 查詢
 */

/** 品項類別定義 */
export type ItemCategory =
  | "肉品"
  | "海鮮"
  | "蔬菜"
  | "菇類"
  | "豆製品"
  | "火鍋料"
  | "特色/內臟"
  | "飲料"
  | "酒類"
  | "底料"
  | "耗材";

/** 叫貨品項 */
export interface MenuItem {
  id: number;
  name: string;
  category: ItemCategory;
  unit: string;
  cost_price: number;
  sell_price: number;
  /** 別名清單，用於文字模式解析 */
  aliases: string[];
}

/** 門市 */
export interface Store {
  id: number;
  name: string;
}

/** 所有分類（順序影響 UI 顯示） */
export const ALL_CATEGORIES: ItemCategory[] = [
  "肉品",
  "海鮮",
  "蔬菜",
  "菇類",
  "豆製品",
  "火鍋料",
  "特色/內臟",
  "飲料",
  "酒類",
  "底料",
  "耗材",
];

/** 分類對應的顏色 badge（tailwind 顏色） */
export const CATEGORY_COLORS: Record<ItemCategory, string> = {
  肉品: "bg-red-100 text-red-700",
  海鮮: "bg-blue-100 text-blue-700",
  蔬菜: "bg-green-100 text-green-700",
  菇類: "bg-yellow-100 text-yellow-700",
  豆製品: "bg-orange-100 text-orange-700",
  火鍋料: "bg-purple-100 text-purple-700",
  "特色/內臟": "bg-pink-100 text-pink-700",
  飲料: "bg-cyan-100 text-cyan-700",
  酒類: "bg-amber-100 text-amber-700",
  底料: "bg-rose-100 text-rose-700",
  耗材: "bg-gray-100 text-gray-700",
};

export const MOCK_ITEMS: MenuItem[] = [
  {
    id: 1,
    name: "台灣豬五花",
    category: "肉品",
    unit: "斤",
    cost_price: 150,
    sell_price: 280,
    aliases: ["五花", "豬五花", "三層肉"],
  },
  {
    id: 2,
    name: "CH霜降牛",
    category: "肉品",
    unit: "斤",
    cost_price: 365,
    sell_price: 580,
    aliases: ["霜降", "霜降牛"],
  },
  {
    id: 3,
    name: "白蝦(40/50)",
    category: "海鮮",
    unit: "包",
    cost_price: 305,
    sell_price: 180,
    aliases: ["蝦", "白蝦", "蝦子"],
  },
  {
    id: 4,
    name: "高麗菜",
    category: "蔬菜",
    unit: "份",
    cost_price: 12,
    sell_price: 80,
    aliases: ["高麗菜"],
  },
  {
    id: 5,
    name: "金針菇",
    category: "菇類",
    unit: "份",
    cost_price: 15,
    sell_price: 80,
    aliases: ["金針菇"],
  },
  {
    id: 6,
    name: "鴨血",
    category: "豆製品",
    unit: "份",
    cost_price: 25,
    sell_price: 80,
    aliases: ["鴨血"],
  },
  {
    id: 7,
    name: "手工蛋餃",
    category: "火鍋料",
    unit: "顆",
    cost_price: 8,
    sell_price: 20,
    aliases: ["蛋餃"],
  },
  {
    id: 8,
    name: "手撕鮮毛肚",
    category: "特色/內臟",
    unit: "份",
    cost_price: 80,
    sell_price: 280,
    aliases: ["毛肚"],
  },
  {
    id: 9,
    name: "台灣啤酒",
    category: "飲料",
    unit: "瓶",
    cost_price: 47,
    sell_price: 100,
    aliases: ["台啤", "台灣啤酒"],
  },
  {
    id: 10,
    name: "真露-原味",
    category: "酒類",
    unit: "瓶",
    cost_price: 84,
    sell_price: 200,
    aliases: ["真露"],
  },
  {
    id: 11,
    name: "松阪豬",
    category: "肉品",
    unit: "斤",
    cost_price: 490,
    sell_price: 380,
    aliases: ["松阪", "松阪豬"],
  },
  {
    id: 12,
    name: "巴沙魚",
    category: "海鮮",
    unit: "kg",
    cost_price: 95,
    sell_price: 180,
    aliases: ["巴沙", "巴沙魚", "鯰魚"],
  },
];

export const MOCK_STORES: Store[] = [
  { id: 1, name: "林森店" },
  { id: 2, name: "信義安和店" },
];
