/**
 * Drizzle ORM Schema — 肥龍老火鍋採購系統
 *
 * 設計決策：
 * - 金額用 numeric(10,2)，支援報價單小數價（如 $63.3/公斤），mode:'number' 直接回 JS number
 *   ⚠️ 客戶端聚合多筆要小心浮點誤差，建議交給 SQL SUM 或用 Decimal lib
 * - 數量用 numeric(10,2)，支援半斤 0.5 等小數
 * - aliases 用 text[]，給 alias-matcher 做模糊匹配
 * - no_delivery_days 用 integer[]，0=週日, 1=週一 ... 6=週六
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────
// 門市
// ─────────────────────────────────────────────
export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  /** 公司名稱（發票/對帳用，每間分店不同統編） */
  companyName: varchar('company_name', { length: 100 }),
  /** 統一編號 */
  taxId: varchar('tax_id', { length: 20 }),
  address: text('address').notNull(),
  hours: text('hours').notNull(),
  manager: varchar('manager', { length: 50 }),
  phone: varchar('phone', { length: 20 }),
  // CRITICAL: sort_order 控制前端門市顯示順序，勿隨意變更預設值
  sortOrder: integer('sort_order').default(0).notNull(),
  /** 類型：store=門市, warehouse=倉庫 */
  type: varchar('type', { length: 10 }).default('store').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 供應商
// ─────────────────────────────────────────────
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  /** 供應商代碼，如 VG-01（蔬菜-01） */
  code: varchar('code', { length: 20 }).unique(),
  name: varchar('name', { length: 50 }).notNull(),
  /** 分類：肉品 | 海鮮 | 蔬菜 | 飲料 | 底料 | 雜貨 | 火鍋料 */
  category: varchar('category', { length: 20 }).notNull(),
  /** 公司名稱（發票/對帳用） */
  companyName: varchar('company_name', { length: 100 }),
  /** 統一編號 */
  taxId: varchar('tax_id', { length: 20 }),
  /** 地址 */
  address: text('address'),
  contact: varchar('contact', { length: 50 }),
  phone: varchar('phone', { length: 20 }),
  notes: text('notes'),
  // CRITICAL: no_delivery_days 影響叫貨截止日計算
  // 0=週日,1=週一,...,6=週六。例如瑞濱海鮮=[0]（週日不配）
  noDeliveryDays: integer('no_delivery_days').array().default([]).notNull(),
  /** 前置天數：今天叫明天到 = 1（預設） */
  leadDays: integer('lead_days').default(1).notNull(),
  /** 送貨天數：下單後幾天到貨（顯示用） */
  deliveryDays: integer('delivery_days').default(1).notNull(),
  /** 免運金額（元），0 = 無免運門檻 */
  freeShippingMin: integer('free_shipping_min').default(0).notNull(),
  /** 結帳方式：'現結' = 當天驗收後請款, '月結' = 月底統一付款 */
  paymentType: varchar('payment_type', { length: 10 }).default('月結').notNull(),
  /** 最低起送金額（元），0 = 無門檻 */
  minOrderAmount: integer('min_order_amount').default(0).notNull(),
  /** 可叫貨日：1=週一...7=週日，如 [1,2,3,4,5] = 平日 */
  orderDays: integer('order_days').array().default([1,2,3,4,5]),
  /** 叫貨截止時間：如 '18:00' */
  orderCutoff: varchar('order_cutoff', { length: 5 }).default('18:00'),
  /** 銀行帳戶資訊（自由格式：銀行 + 分行 + 帳號 + 戶名） */
  bankAccount: text('bank_account'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 品項
// ─────────────────────────────────────────────
export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  /** 品號，如 MT-001（肉品-001），唯一索引 */
  sku: varchar('sku', { length: 20 }).unique(),
  name: varchar('name', { length: 100 }).notNull(),
  /** 分類：肉品 | 海鮮 | 蔬菜 | 火鍋料 | 底料 | 飲料 | 酒水 | 雜貨 */
  category: varchar('category', { length: 20 }).notNull(),
  /** 主單位：斤 | 包 | 顆 | 盒 | 瓶 | 箱 | kg | 份 | 塊 | 條 */
  unit: varchar('unit', { length: 10 }).notNull(),
  supplierId: integer('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  /** 進貨價（元）— 總公司跟廠商買的價格 */
  costPrice: numeric('cost_price', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  /** 店家採購價（元）— 分店跟總公司買的價格。0 = 用 cost_price × COST_MARKUP */
  storePrice: numeric('store_price', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  /** 售價（元）— 賣給客人的價格 */
  sellPrice: numeric('sell_price', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  /** 內部備註（出餐規格、損耗等，內部人員看） */
  spec: text('spec'),
  /** 叫貨備註（切法、尺寸限制等，叫貨單上給供應商看） */
  supplierNotes: text('supplier_notes'),
  /** 最低訂購量（有些供應商要求一箱起跳） */
  minOrderQty: numeric('min_order_qty', { precision: 10, scale: 2 }).default('1').notNull(),
  /** 包裝規格（如「10斤/箱」「6瓶/箱」） */
  packSize: varchar('pack_size', { length: 50 }),
  /** 儲存方式：cold=冷藏, frozen=冷凍, room=常溫 */
  storageType: varchar('storage_type', { length: 10 }).default('cold'),
  // CRITICAL: aliases 是 alias-matcher 的資料來源
  // 範例：['五花','豬五花','三層肉']，影響文字叫貨的匹配準確度
  aliases: text('aliases').array().default([]).notNull(),
  /** 安全庫存量（允許小數，例如 0.5 斤） */
  safetyStock: numeric('safety_stock', { precision: 10, scale: 2 })
    .default('0')
    .notNull(),
  safetyStockUnit: varchar('safety_stock_unit', { length: 10 }),
  /** 目前庫存量（允許小數） */
  currentStock: numeric('current_stock', { precision: 10, scale: 2 })
    .default('0')
    .notNull(),
  /** 庫存單位（斤/包/瓶/箱等，跟叫貨單位可能不同） */
  stockUnit: varchar('stock_unit', { length: 10 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 使用者
// ─────────────────────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  /** 員工編號（登入用） */
  employeeId: varchar('employee_id', { length: 20 }).unique().notNull(),
  /** 手機號碼（選填，聯絡用） */
  phone: varchar('phone', { length: 20 }),
  /** bcrypt hash 密碼 */
  pinHash: varchar('pin_hash', { length: 255 }).notNull(),
  /** role: 'admin' | 'buyer' | 'manager' | 'staff' */
  role: varchar('role', { length: 20 }).default('staff').notNull(),
  /** staff 綁定門市；admin/buyer 可為 null（跨門市） */
  storeId: integer('store_id').references(() => stores.id),
  /** 可叫貨的供應商 ID 清單（空陣列 = 全部可叫；admin/buyer 忽略此限制） */
  allowedSuppliers: integer('allowed_suppliers').array().default([]).notNull(),
  /** 個人 API Token（給該使用者的 AI 助理用） */
  apiToken: varchar('api_token', { length: 64 }).unique(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 角色權限
// ─────────────────────────────────────────────
export const rolePermissions = pgTable('role_permissions', {
  /** role: 'admin' | 'buyer' | 'manager' | 'staff' */
  role: varchar('role', { length: 20 }).primaryKey(),
  /** 允許的頁面 key 陣列，['*'] 表示全部 */
  allowedPages: text('allowed_pages').array().default([]).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 門市菜單（哪間店賣哪些菜品）
// 空表 = 該店賣所有菜品（向下相容）
// ─────────────────────────────────────────────
export const storeMenu = pgTable('store_menu', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  menuItemId: integer('menu_item_id').references(() => menuItems.id, { onDelete: 'cascade' }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 採購訂單（每日彙總單）
// ─────────────────────────────────────────────
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  /** 採購日期（配送日期），用 date 型別儲存 YYYY-MM-DD */
  orderDate: date('order_date').notNull(),
  /**
   * status 狀態機：
   * draft → confirmed → ordered → received → closed
   * CRITICAL: 狀態轉換邏輯在 src/lib/order-state.ts，不可跳過中間狀態
   */
  status: varchar('status', { length: 20 }).default('draft').notNull(),
  /** 訂單總額（元），由 order_items 加總後更新 */
  totalAmount: integer('total_amount').default(0).notNull(),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 訂單明細
// ─────────────────────────────────────────────
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  itemId: integer('item_id')
    .references(() => items.id)
    .notNull(),
  storeId: integer('store_id')
    .references(() => stores.id)
    .notNull(),
  /** 叫貨數量（允許小數，例如 2.5 斤） */
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  unit: varchar('unit', { length: 10 }).notNull(),
  /**
   * 🚫 單價（元）快照 — 下單當下從 items.cost_price 複製過來的一份拷貝
   * 日後 items.cost_price 改變（例如 price-schedule 套用新價）時，
   * 此欄位不會變動，歷史訂單金額保持不變。
   *
   * ⚠️ 顯示訂單金額一律從此欄位取，不要 JOIN items 動態查 cost_price。
   * 否則帳務報表會因為 item 價格被更新而追溯性變動，對不上帳。
   */
  unitPrice: numeric('unit_price', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  /** 小計（元）= roundMoney(quantity * unit_price)，保留 2 位小數 */
  subtotal: numeric('subtotal', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  notes: text('notes'),
  /** 叫貨人（哪個員工叫的） */
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 驗收紀錄
// ─────────────────────────────────────────────
export const receiving = pgTable('receiving', {
  id: serial('id').primaryKey(),
  orderItemId: integer('order_item_id')
    .references(() => orderItems.id, { onDelete: 'cascade' })
    .notNull(),
  /** 實收數量（簽收當下的量，含後來退貨的部分） */
  receivedQty: numeric('received_qty', { precision: 10, scale: 2 }).notNull(),
  /**
   * 退貨數量（result='品質問題' 時填寫部分退貨量；整批退就填 = receivedQty）
   * CRITICAL: 應付 = (receivedQty - returnedQty) × unitPrice，預設 0
   */
  returnedQty: numeric('returned_qty', { precision: 10, scale: 2 }).default('0').notNull(),
  /** result: '正常' | '短缺' | '品質問題' | '未到貨' */
  result: varchar('result', { length: 20 }).default('正常').notNull(),
  /** 異常說明（result !== '正常' 時填寫） */
  issue: text('issue'),
  /** 處理方式 */
  resolution: text('resolution'),
  receivedAt: timestamp('received_at'),
  receivedBy: integer('received_by').references(() => users.id),
});

// ─────────────────────────────────────────────
// 供應商付款紀錄（追蹤每筆訂單對每個供應商的付款）
// ─────────────────────────────────────────────
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  supplierId: integer('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  /** 應付金額（元） */
  amount: numeric('amount', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  /** 付款狀態：'unpaid' | 'pending' | 'paid' */
  status: varchar('status', { length: 20 }).default('unpaid').notNull(),
  /** 結帳方式：'現結' | '月結'（從供應商複製） */
  paymentType: varchar('payment_type', { length: 10 }).notNull(),
  /** 付款日期 */
  paidAt: timestamp('paid_at'),
  /** 付款備註 */
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

// 供應商叫貨單（purchaseOrders + purchaseOrderItems）定義在檔案尾部

// ─────────────────────────────────────────────
// Relations（Drizzle 關聯，供 query API 使用）
// ─────────────────────────────────────────────

export const storesRelations = relations(stores, ({ many }) => ({
  users: many(users),
  orderItems: many(orderItems),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  items: many(items),
  payments: many(payments),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [items.supplierId],
    references: [suppliers.id],
  }),
  orderItems: many(orderItems),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, {
    fields: [users.storeId],
    references: [stores.id],
  }),
  orders: many(orders),
  receivings: many(receiving),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  creator: one(users, {
    fields: [orders.createdBy],
    references: [users.id],
  }),
  orderItems: many(orderItems),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  supplier: one(suppliers, {
    fields: [payments.supplierId],
    references: [suppliers.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  item: one(items, {
    fields: [orderItems.itemId],
    references: [items.id],
  }),
  store: one(stores, {
    fields: [orderItems.storeId],
    references: [stores.id],
  }),
  receivings: many(receiving),
}));

export const receivingRelations = relations(receiving, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [receiving.orderItemId],
    references: [orderItems.id],
  }),
  receiver: one(users, {
    fields: [receiving.receivedBy],
    references: [users.id],
  }),
}));

// ─────────────────────────────────────────────
// Type exports（從 schema 推導 TypeScript 型別）
// ─────────────────────────────────────────────

export type Store = typeof stores.$inferSelect;
export type NewStore = typeof stores.$inferInsert;

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

export type Receiving = typeof receiving.$inferSelect;
export type NewReceiving = typeof receiving.$inferInsert;

// ─────────────────────────────────────────────
// BOM（配方對照表）
// ─────────────────────────────────────────────
/** 菜單商品（售出的菜品，不同於原料 items） */
export const menuItems = pgTable('menu_items', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  /** 分類：鍋底 | 肉品 | 海鮮 | 火鍋料 | 特色 | 蔬菜 | 飲料 | 酒類 */
  category: varchar('category', { length: 20 }).notNull(),
  /** 售價（元） */
  sellPrice: numeric('sell_price', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  /** 每份成本（自動從 BOM 計算，元） */
  costPerServing: numeric('cost_per_serving', { precision: 10, scale: 2 }).default('0'),
  /** 毛利率（0~1，自動計算） */
  marginRate: numeric('margin_rate', { precision: 5, scale: 3 }).default('0'),
  /** 備註/說明 */
  notes: text('notes'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** BOM 明細：一道菜用了哪些食材、用量多少 */
export const bomItems = pgTable('bom_items', {
  id: serial('id').primaryKey(),
  /** 所屬菜單商品 */
  menuItemId: integer('menu_item_id')
    .references(() => menuItems.id, { onDelete: 'cascade' })
    .notNull(),
  /** 使用的原料品項 */
  itemId: integer('item_id')
    .references(() => items.id, { onDelete: 'restrict' }),
  /** 原料名稱（當 itemId 無法對應時用文字紀錄） */
  ingredientName: varchar('ingredient_name', { length: 100 }).notNull(),
  /** 用量描述（如 "120g", "5隻", "半鍋"） */
  quantity: varchar('quantity', { length: 30 }).notNull(),
  /** 排序（第幾項原料） */
  sortOrder: integer('sort_order').default(0).notNull(),
});

// ── BOM relations ──
export const menuItemsRelations = relations(menuItems, ({ many }) => ({
  bomItems: many(bomItems),
}));

export const bomItemsRelations = relations(bomItems, ({ one }) => ({
  menuItem: one(menuItems, {
    fields: [bomItems.menuItemId],
    references: [menuItems.id],
  }),
  item: one(items, {
    fields: [bomItems.itemId],
    references: [items.id],
  }),
}));

export type MenuItem2 = typeof menuItems.$inferSelect;
export type NewMenuItem2 = typeof menuItems.$inferInsert;

export type BomItem = typeof bomItems.$inferSelect;
export type NewBomItem = typeof bomItems.$inferInsert;

// ─────────────────────────────────────────────
// 價格歷史（追蹤進貨價波動）
// ─────────────────────────────────────────────
export const itemPriceHistory = pgTable('item_price_history', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => items.id, { onDelete: 'cascade' })
    .notNull(),
  /** 舊進貨價（元/kg 或原單位） */
  oldPrice: numeric('old_price', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  /** 新進貨價（元/kg 或原單位） */
  newPrice: numeric('new_price', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  /** 價差（元），正=漲、負=跌 */
  priceDiff: numeric('price_diff', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  /** 漲跌幅（%），如 5.2 表示漲 5.2% */
  changePercent: numeric('change_percent', { precision: 6, scale: 2 }).default('0'),
  /** 價格單位：'kg' | 'piece' | 'pack' | 'bottle' 等 */
  priceUnit: varchar('price_unit', { length: 20 }).default('kg').notNull(),
  /** 生效日期 */
  effectiveDate: date('effective_date').notNull(),
  /** 來源（如「以曜 115年4月報價單」） */
  source: varchar('source', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const itemPriceHistoryRelations = relations(itemPriceHistory, ({ one }) => ({
  item: one(items, {
    fields: [itemPriceHistory.itemId],
    references: [items.id],
  }),
}));

export type ItemPriceHistory = typeof itemPriceHistory.$inferSelect;
export type NewItemPriceHistory = typeof itemPriceHistory.$inferInsert;

// ─────────────────────────────────────────────
// 預約改價排程
// ─────────────────────────────────────────────
export const scheduledPriceChanges = pgTable('scheduled_price_changes', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => items.id, { onDelete: 'cascade' })
    .notNull(),
  /** 新進貨價（元） */
  newCostPrice: numeric('new_cost_price', { precision: 10, scale: 2, mode: 'number' }).notNull(),
  /** 新店家採購價（元），null = 不改 */
  newStorePrice: numeric('new_store_price', { precision: 10, scale: 2, mode: 'number' }),
  /** 生效日期 */
  effectiveDate: date('effective_date').notNull(),
  /** 來源（如「鉊玖通知」「以曜4月報價」） */
  source: varchar('source', { length: 100 }),
  /** 備註 */
  notes: text('notes'),
  /** 狀態：pending=待執行 / applied=已生效 / cancelled=已取消 */
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  /** 建立者 */
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  /** 實際執行時間 */
  appliedAt: timestamp('applied_at'),
});

export const scheduledPriceChangesRelations = relations(scheduledPriceChanges, ({ one }) => ({
  item: one(items, {
    fields: [scheduledPriceChanges.itemId],
    references: [items.id],
  }),
  creator: one(users, {
    fields: [scheduledPriceChanges.createdBy],
    references: [users.id],
  }),
}));

export type ScheduledPriceChange = typeof scheduledPriceChanges.$inferSelect;
export type NewScheduledPriceChange = typeof scheduledPriceChanges.$inferInsert;

// ─────────────────────────────────────────────
// 庫存異動紀錄
// ─────────────────────────────────────────────
export const inventoryLogs = pgTable('inventory_logs', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id')
    .references(() => items.id, { onDelete: 'cascade' })
    .notNull(),
  /** 異動類型：in=進貨, out=出貨/消耗, adjust=盤點調整 */
  type: varchar('type', { length: 10 }).notNull(),
  /** 異動數量（正數=增加，負數=減少） */
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  /** 單位 */
  unit: varchar('unit', { length: 10 }),
  /** 異動後庫存量 */
  balanceAfter: numeric('balance_after', { precision: 10, scale: 2 }).notNull(),
  /** 關聯門市（哪間店的進出貨） */
  storeId: integer('store_id').references(() => stores.id),
  /** 來源說明（如「驗收單 #123」「盤點調整」「POS 銷售」） */
  source: varchar('source', { length: 100 }),
  /** 備註 */
  notes: text('notes'),
  /** 操作人 */
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inventoryLogsRelations = relations(inventoryLogs, ({ one }) => ({
  item: one(items, {
    fields: [inventoryLogs.itemId],
    references: [items.id],
  }),
  store: one(stores, {
    fields: [inventoryLogs.storeId],
    references: [stores.id],
  }),
}));

export type InventoryLog = typeof inventoryLogs.$inferSelect;
export type NewInventoryLog = typeof inventoryLogs.$inferInsert;

// ─────────────────────────────────────────────
// 分店庫存（各門市 + 總公司倉庫各自的庫存量）
// store_id = NULL → 總公司倉庫
// ─────────────────────────────────────────────
export const storeInventory = pgTable('store_inventory', {
  id: serial('id').primaryKey(),
  // CRITICAL: onDelete 是 RESTRICT — 防止誤刪品項時連帶殺掉庫存紀錄
  // 有歷史意義的資料不該因誤刪一個 item 就全部消失
  itemId: integer('item_id')
    .references(() => items.id, { onDelete: 'restrict' })
    .notNull(),
  /** NULL = 總公司倉庫 */
  storeId: integer('store_id').references(() => stores.id),
  currentStock: numeric('current_stock', { precision: 10, scale: 2 })
    .default('0')
    .notNull(),
  stockUnit: varchar('stock_unit', { length: 10 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const storeInventoryRelations = relations(storeInventory, ({ one }) => ({
  item: one(items, {
    fields: [storeInventory.itemId],
    references: [items.id],
  }),
  store: one(stores, {
    fields: [storeInventory.storeId],
    references: [stores.id],
  }),
}));

export type StoreInventory = typeof storeInventory.$inferSelect;

// ─────────────────────────────────────────────
// 門市調撥/借料
// 流程：A 店借食材給 B 店 → 記錄 → 歸還或沖銷
// ─────────────────────────────────────────────
export const transfers = pgTable('transfers', {
  id: serial('id').primaryKey(),
  /** 調撥單號（如 TR-20260330-001） */
  transferNumber: varchar('transfer_number', { length: 30 }).unique().notNull(),
  /** 類型：transfer=調撥, borrow=借料 */
  type: varchar('type', { length: 10 }).notNull(),
  /** 來源門市 */
  fromStoreId: integer('from_store_id')
    .references(() => stores.id)
    .notNull(),
  /** 目標門市 */
  toStoreId: integer('to_store_id')
    .references(() => stores.id)
    .notNull(),
  /** 狀態：pending=待確認, confirmed=已確認, returned=已歸還, settled=已沖銷 */
  status: varchar('status', { length: 20 }).default('confirmed').notNull(),
  /** 備註 */
  notes: text('notes'),
  /** 建單人 */
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  /** 歸還/沖銷時間 */
  settledAt: timestamp('settled_at'),
});

export const transferItems = pgTable('transfer_items', {
  id: serial('id').primaryKey(),
  transferId: integer('transfer_id')
    .references(() => transfers.id, { onDelete: 'cascade' })
    .notNull(),
  itemId: integer('item_id')
    .references(() => items.id)
    .notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  unit: varchar('unit', { length: 10 }),
  /** 歸還數量（借料用） */
  returnedQty: numeric('returned_qty', { precision: 10, scale: 2 }).default('0').notNull(),
});

export const transfersRelations = relations(transfers, ({ one, many }) => ({
  fromStore: one(stores, { fields: [transfers.fromStoreId], references: [stores.id], relationName: 'fromStore' }),
  toStore: one(stores, { fields: [transfers.toStoreId], references: [stores.id], relationName: 'toStore' }),
  items: many(transferItems),
}));

export const transferItemsRelations = relations(transferItems, ({ one }) => ({
  transfer: one(transfers, { fields: [transferItems.transferId], references: [transfers.id] }),
  item: one(items, { fields: [transferItems.itemId], references: [items.id] }),
}));

export type Transfer = typeof transfers.$inferSelect;
export type TransferItem = typeof transferItems.$inferSelect;

// ─────────────────────────────────────────────
// 供應商叫貨單（PO = Purchase Order）
// 流程：各店訂單 → 按供應商拆單 → 匯出給供應商（無價格）
// ─────────────────────────────────────────────
export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  /** PO 編號（如 PO-20260327-001） */
  poNumber: varchar('po_number', { length: 30 }).unique().notNull(),
  /** 供應商 */
  supplierId: integer('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  /** 配送日期 */
  deliveryDate: date('delivery_date').notNull(),
  /** 狀態：draft=草稿, sent=已傳送, received=已收貨, cancelled=已取消 */
  status: varchar('status', { length: 20 }).default('draft').notNull(),
  /** 總金額（含各店合計，元） */
  totalAmount: integer('total_amount').default(0).notNull(),
  /** 備註（給供應商看的） */
  notes: text('notes'),
  /** 建單人 */
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 供應商叫貨單明細（含門市明細）
// ─────────────────────────────────────────────
export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: serial('id').primaryKey(),
  poId: integer('po_id')
    .references(() => purchaseOrders.id, { onDelete: 'cascade' })
    .notNull(),
  itemId: integer('item_id')
    .references(() => items.id)
    .notNull(),
  /** 門市（哪間店叫的） */
  storeId: integer('store_id')
    .references(() => stores.id)
    .notNull(),
  /** 數量 */
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(),
  /** 單位 */
  unit: varchar('unit', { length: 10 }).notNull(),
  /** 當時進貨價（鎖定，不受後續報價更新影響） */
  unitPrice: numeric('unit_price', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  /** 小計 */
  subtotal: numeric('subtotal', { precision: 10, scale: 2, mode: 'number' }).default(0).notNull(),
  /** 品項備註（如「切24cm以內」） */
  notes: text('notes'),
  /** 關聯的門市訂單 ID（追溯用） */
  orderItemId: integer('order_item_id').references(() => orderItems.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [purchaseOrders.supplierId],
    references: [suppliers.id],
  }),
  items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.poId],
    references: [purchaseOrders.id],
  }),
  item: one(items, {
    fields: [purchaseOrderItems.itemId],
    references: [items.id],
  }),
  store: one(stores, {
    fields: [purchaseOrderItems.storeId],
    references: [stores.id],
  }),
}));

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
