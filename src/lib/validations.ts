/**
 * Zod 驗證 schemas — 所有 API POST body 的共用驗證
 *
 * CRITICAL: 所有使用者輸入必須用 schema 驗證，不要直接 body as Type
 */
import { z } from "zod";

// ── 訂單 ──

export const createOrderSchema = z.object({
  storeId: z.number().int().positive("門市 ID 必須為正整數"),
  items: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        quantity: z.number().positive("數量必須大於 0"),
        unit: z.string().min(1),
        unitPrice: z.number().min(0),
      })
    )
    .min(1, "至少需要一個品項"),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式: YYYY-MM-DD").optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ── 庫存 ──

export const inventoryAdjustSchema = z.object({
  itemId: z.number().int().positive(),
  type: z.enum(["in", "out", "adjust", "transfer", "waste", "meal"]),
  quantity: z.number().min(0, "數量不可為負"),
  unit: z.string().optional(),
  storeId: z.number().int().positive(),
  source: z.string().optional(),
  notes: z.string().optional(),
  reason: z.enum(["expired", "damaged", "other"]).optional(),
  toStoreId: z.number().int().positive().optional(),
});

export const inventoryBatchSchema = z.object({
  storeId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        quantity: z.number().min(0, "數量不可為負"),
        unit: z.string().optional(),
      })
    )
    .min(1, "至少需要一個品項")
    .max(500, "單次盤點上限 500 品項"),
  source: z.string().optional(),
});

export type InventoryBatchInput = z.infer<typeof inventoryBatchSchema>;

// ── 調撥 ──

export const createTransferSchema = z.object({
  type: z.enum(["transfer", "borrow"]),
  fromStoreId: z.number().int().positive(),
  toStoreId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        quantity: z.number().positive("數量必須大於 0"),
        unit: z.string().optional(),
      })
    )
    .min(1, "至少需要一個品項"),
  notes: z.string().optional(),
});

// ── 使用者 ──

export const createUserSchema = z.object({
  name: z.string().min(1, "姓名不可為空"),
  employeeId: z.string().min(1, "員工編號不可為空"),
  password: z.string().min(4, "密碼至少 4 個字元"),
  phone: z.string().optional(),
  role: z.enum(["admin", "buyer", "manager", "staff"]).default("staff"),
  storeId: z.number().int().positive().nullable().optional(),
});

// ── 驗證輔助函式 ──

/**
 * 解析並驗證 request body，失敗時回傳 400 錯誤 Response
 */
export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown):
  | { ok: true; data: T }
  | { ok: false; response: Response } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const firstError = result.error.issues[0];
    const message = firstError
      ? `${firstError.path.join(".")}: ${firstError.message}`
      : "請求資料格式錯誤";
    return {
      ok: false,
      response: Response.json({ error: message }, { status: 400 }),
    };
  }
  return { ok: true, data: result.data };
}
