/**
 * 驗收 API
 * GET /api/receiving?orderId=xxx — 讀取某訂單的驗收狀態
 * POST /api/receiving — 寫入/更新驗收紀錄
 */
import { NextRequest, NextResponse } from "next/server";
import { db, rawSql } from "@/lib/db";
import { receiving, orderItems, items, stores, suppliers } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { authenticateRequest, requireManagerOrAbove } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "缺少 orderId" }, { status: 400 });
  }

  const parsedOrderId = parseIntSafe(orderId);
  if (parsedOrderId === null) {
    return NextResponse.json({ error: "無效的訂單 ID" }, { status: 400 });
  }

  // 取得該訂單的所有明細 + 對應的驗收紀錄
  const details = await db
    .select({
      orderItemId: orderItems.id,
      quantity: orderItems.quantity,
      unit: orderItems.unit,
      unitPrice: orderItems.unitPrice,
      subtotal: orderItems.subtotal,
      itemName: items.name,
      itemCategory: items.category,
      supplierName: suppliers.name,
      supplierId: suppliers.id,
      storeName: stores.name,
      storeId: stores.id,
    })
    .from(orderItems)
    .innerJoin(items, eq(orderItems.itemId, items.id))
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .innerJoin(stores, eq(orderItems.storeId, stores.id))
    .where(eq(orderItems.orderId, parsedOrderId));

  if (details.length === 0) {
    return NextResponse.json({ details: [], receivings: [] });
  }

  // 取得已驗收的紀錄
  const orderItemIds = details.map((d) => d.orderItemId);
  const receivings = await db
    .select()
    .from(receiving)
    .where(inArray(receiving.orderItemId, orderItemIds));

  return NextResponse.json({ details, receivings });
}

export async function POST(request: NextRequest) {
  // CRITICAL: 驗收操作需要 manager 以上權限
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;

  // CRITICAL: 從認證結果取得驗收人 ID（個人 token 或 cookie session 都有值）
  const receivedByUserId = auth.userId ?? null;

  const body = await request.json();

  // 支援批次驗收
  const records = body.records as Array<{
    orderItemId: number;
    receivedQty: string;
    result: string;
    issue?: string;
    resolution?: string;
    receivedBy?: number;
  }>;

  if (!records?.length) {
    return NextResponse.json({ error: "缺少驗收資料" }, { status: 400 });
  }

  // CRITICAL: 整個批次驗收（含寫驗收紀錄 + 入庫更新）包在 transaction 內
  // 避免中途失敗造成部分已入庫部分沒入的不一致狀態
  // CRITICAL: received_at 用 PostgreSQL NOW() 不用 JS Date object
  // 因為 lib/db/index.ts 的 types.numeric parser 可能覆蓋預設 Date 序列化器，
  // 傳 Date instance 會 throw "Received an instance of Date"
  try {
    const resultsCount = await rawSql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof rawSql;
      let count = 0;

      // Phase 1: 寫驗收紀錄（全部 20 筆先寫完再入庫）
      for (const rec of records) {
        const resolvedReceivedBy = receivedByUserId ?? rec.receivedBy ?? null;

        const [existing] = await tx`
          SELECT id FROM receiving WHERE order_item_id = ${rec.orderItemId} LIMIT 1
        `;

        if (existing) {
          await tx`
            UPDATE receiving SET
              received_qty = ${rec.receivedQty},
              result = ${rec.result},
              issue = ${rec.issue || null},
              resolution = ${rec.resolution || null},
              received_at = NOW(),
              received_by = ${resolvedReceivedBy}
            WHERE order_item_id = ${rec.orderItemId}
          `;
        } else {
          await tx`
            INSERT INTO receiving
              (order_item_id, received_qty, result, issue, resolution, received_at, received_by)
            VALUES
              (${rec.orderItemId}, ${rec.receivedQty}, ${rec.result},
               ${rec.issue || null}, ${rec.resolution || null}, NOW(), ${resolvedReceivedBy})
          `;
        }
        count++;
      }

      // Phase 2: 入庫（只對正常品項）
      for (const rec of records) {
        if (rec.result !== '正常' && rec.result !== undefined) continue;

        const [oi] = await tx`
          SELECT item_id, store_id, unit FROM order_items WHERE id = ${rec.orderItemId}
        `;
        if (!oi) continue;

        const qty = parseFloat(rec.receivedQty) || 0;
        if (qty <= 0) continue;

        // 鎖行後 upsert store_inventory
        const [existing] = await tx`
          SELECT id FROM store_inventory
          WHERE item_id = ${oi.item_id} AND store_id = ${oi.store_id}
          FOR UPDATE
        `;
        if (existing) {
          await tx`
            UPDATE store_inventory SET current_stock = current_stock + ${qty}, updated_at = NOW()
            WHERE item_id = ${oi.item_id} AND store_id = ${oi.store_id}
          `;
        } else {
          await tx`
            INSERT INTO store_inventory (item_id, store_id, current_stock, stock_unit)
            VALUES (${oi.item_id}, ${oi.store_id}, ${qty}, ${oi.unit})
          `;
        }

        // 同步 items.current_stock
        const [{ total }] = await tx`
          SELECT COALESCE(SUM(current_stock::numeric), 0) as total
          FROM store_inventory WHERE item_id = ${oi.item_id}
        `;
        await tx`UPDATE items SET current_stock = ${total} WHERE id = ${oi.item_id}`;

        // 記 inventory_log
        const [stockRow] = await tx`
          SELECT current_stock FROM store_inventory
          WHERE item_id = ${oi.item_id} AND store_id = ${oi.store_id}
        `;
        await tx`
          INSERT INTO inventory_logs
            (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
          VALUES
            (${oi.item_id}, 'in', ${qty}, ${oi.unit},
             ${stockRow?.current_stock || qty}, ${oi.store_id}, '驗收入庫', ${receivedByUserId})
        `;
      }

      return count;
    });

    return NextResponse.json({ success: true, count: resultsCount });
  } catch (err) {
    // 印出完整 error trace 到 Vercel logs（debug receiving 500 用）
    console.error("[receiving POST] error:", err);
    if (err instanceof Error && err.stack) {
      console.error("[receiving POST] stack:", err.stack);
    }
    const msg = err instanceof Error ? err.message : "驗收失敗，已自動回滾";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
