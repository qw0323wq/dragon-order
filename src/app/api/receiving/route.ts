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
    /** 退貨數量（部分品質問題用，預設 0；整批退時 = receivedQty） */
    returnedQty?: string;
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

      // CRITICAL: 差額入庫（防重複入庫）
      // 舊版每次收到 payload 就無條件把 qty 加進庫存 → 重送/「送出全部」含已驗品項會重複計。
      // 改成：算「本次應入庫淨量」跟「這筆之前已入庫的淨量」的差額，只補差額。
      //   入庫淨量 = (result 為 正常/未指定) ? (received - returned) : 0
      //   重送同值 → 差額 0（不動）；改量 → 補差；正常改短缺/未到貨 → 差額為負（扣回）
      function stockNet(result: string | undefined, received: string | number, returned: string | number | undefined): number {
        const isStockIn = result === '正常' || result === undefined;
        if (!isStockIn) return 0;
        const r = parseFloat(String(received)) || 0;
        const ret = parseFloat(String(returned ?? '0')) || 0;
        return r - ret;
      }

      for (const rec of records) {
        const resolvedReceivedBy = receivedByUserId ?? rec.receivedBy ?? null;
        const returnedQty = rec.returnedQty ?? '0';

        // 先讀舊 receiving（拿舊淨量，算差額用）
        const [existing] = await tx`
          SELECT received_qty, returned_qty, result FROM receiving
          WHERE order_item_id = ${rec.orderItemId} LIMIT 1
        `;
        const oldNet = existing
          ? stockNet(existing.result as string, existing.received_qty as string, existing.returned_qty as string)
          : 0;

        // upsert receiving 紀錄
        if (existing) {
          await tx`
            UPDATE receiving SET
              received_qty = ${rec.receivedQty},
              returned_qty = ${returnedQty},
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
              (order_item_id, received_qty, returned_qty, result, issue, resolution, received_at, received_by)
            VALUES
              (${rec.orderItemId}, ${rec.receivedQty}, ${returnedQty}, ${rec.result},
               ${rec.issue || null}, ${rec.resolution || null}, NOW(), ${resolvedReceivedBy})
          `;
        }
        count++;

        // 差額入庫
        const newNet = stockNet(rec.result, rec.receivedQty, returnedQty);
        const delta = newNet - oldNet;
        if (delta === 0) continue;

        const [oi] = await tx`
          SELECT item_id, store_id, unit FROM order_items WHERE id = ${rec.orderItemId}
        `;
        if (!oi) continue;

        // 鎖行 upsert store_inventory（加差額，可正可負）
        const [inv] = await tx`
          SELECT id FROM store_inventory
          WHERE item_id = ${oi.item_id} AND store_id = ${oi.store_id}
          FOR UPDATE
        `;
        if (inv) {
          await tx`
            UPDATE store_inventory SET current_stock = current_stock + ${delta}, updated_at = NOW()
            WHERE item_id = ${oi.item_id} AND store_id = ${oi.store_id}
          `;
        } else {
          await tx`
            INSERT INTO store_inventory (item_id, store_id, current_stock, stock_unit)
            VALUES (${oi.item_id}, ${oi.store_id}, ${delta}, ${oi.unit})
          `;
        }

        // 同步 items.current_stock（跨店加總）
        const [{ total }] = await tx`
          SELECT COALESCE(SUM(current_stock::numeric), 0) as total
          FROM store_inventory WHERE item_id = ${oi.item_id}
        `;
        await tx`UPDATE items SET current_stock = ${total} WHERE id = ${oi.item_id}`;

        // 記 inventory_log（差額的方向）
        const [stockRow] = await tx`
          SELECT current_stock FROM store_inventory
          WHERE item_id = ${oi.item_id} AND store_id = ${oi.store_id}
        `;
        await tx`
          INSERT INTO inventory_logs
            (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
          VALUES
            (${oi.item_id}, ${delta > 0 ? 'in' : 'out'}, ${delta}, ${oi.unit},
             ${stockRow?.current_stock ?? 0}, ${oi.store_id}, '驗收入庫', ${receivedByUserId})
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
