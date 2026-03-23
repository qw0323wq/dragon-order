/**
 * Drizzle ORM Schema — 肥龍老火鍋採購系統
 *
 * 設計決策：
 * - 金額全部用 integer（元），避免浮點誤差
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 供應商
// ─────────────────────────────────────────────
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
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
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 品項
// ─────────────────────────────────────────────
export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  /** 分類：肉品 | 海鮮 | 蔬菜 | 火鍋料 | 底料 | 飲料 | 酒水 | 雜貨 */
  category: varchar('category', { length: 20 }).notNull(),
  /** 主單位：斤 | 包 | 顆 | 盒 | 瓶 | 箱 | kg | 份 | 塊 | 條 */
  unit: varchar('unit', { length: 10 }).notNull(),
  supplierId: integer('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  /** 進貨價（元），整數避免浮點 */
  costPrice: integer('cost_price').default(0).notNull(),
  /** 售價（元），整數 */
  sellPrice: integer('sell_price').default(0).notNull(),
  spec: text('spec'),
  // CRITICAL: aliases 是 alias-matcher 的資料來源
  // 範例：['五花','豬五花','三層肉']，影響文字叫貨的匹配準確度
  aliases: text('aliases').array().default([]).notNull(),
  /** 安全庫存量（允許小數，例如 0.5 斤） */
  safetyStock: numeric('safety_stock', { precision: 10, scale: 2 })
    .default('0')
    .notNull(),
  safetyStockUnit: varchar('safety_stock_unit', { length: 10 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 使用者
// ─────────────────────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  phone: varchar('phone', { length: 20 }).unique().notNull(),
  /** bcrypt hash，不存明碼 */
  pinHash: varchar('pin_hash', { length: 100 }).notNull(),
  /** role: 'owner' | 'manager' | 'staff' */
  role: varchar('role', { length: 10 }).default('staff').notNull(),
  /** staff 綁定門市；owner/manager 可為 null（跨門市） */
  storeId: integer('store_id').references(() => stores.id),
  /** 可叫貨的供應商 ID 清單（空陣列 = 全部可叫；owner/manager 忽略此限制） */
  allowedSuppliers: integer('allowed_suppliers').array().default([]).notNull(),
  /** 個人 API Token（給該使用者的 AI 助理用） */
  apiToken: varchar('api_token', { length: 64 }).unique(),
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
    .references(() => orders.id)
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
  /** 單價（元），從 items.cost_price 複製，允許當下調整 */
  unitPrice: integer('unit_price').default(0).notNull(),
  /** 小計（元）= quantity * unit_price，整數四捨五入 */
  subtotal: integer('subtotal').default(0).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// 驗收紀錄
// ─────────────────────────────────────────────
export const receiving = pgTable('receiving', {
  id: serial('id').primaryKey(),
  orderItemId: integer('order_item_id')
    .references(() => orderItems.id)
    .notNull(),
  /** 實收數量 */
  receivedQty: numeric('received_qty', { precision: 10, scale: 2 }).notNull(),
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
    .references(() => orders.id)
    .notNull(),
  supplierId: integer('supplier_id')
    .references(() => suppliers.id)
    .notNull(),
  /** 應付金額（元） */
  amount: integer('amount').default(0).notNull(),
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
  sellPrice: integer('sell_price').default(0).notNull(),
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
