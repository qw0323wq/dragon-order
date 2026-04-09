/**
 * 批次庫存盤點 API
 *
 * POST /api/inventory/batch — 一次提交多品項盤點結果
 *
 * Body: {
 *   storeId: number,
 *   items: Array<{ itemId: number, quantity: number, unit?: string }>,
 *   source?: string
 * }
 *
 * CRITICAL: 整個批次在 transaction 內執行，失敗全部回滾
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { requireManagerOrAbove } from "@/lib/api-auth";
import { verifySession } from "@/lib/session";
import { inventoryBatchSchema, parseBody } from "@/lib/validations";

export async function POST(request: NextRequest) {
  // 庫存盤點需要 manager 以上權限
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;

  let userId: number | null = null;
  if (auth.source === "cookie") {
    const session = verifySession<{ id: number }>(
      request.cookies.get("dragon-session")?.value || ""
    );
    userId = session?.id ?? null;
  } else if (auth.userId) {
    userId = auth.userId;
  }

  const body = await request.json();
  const parsed = parseBody(inventoryBatchSchema, body);
  if (!parsed.ok) return parsed.response;
  const { storeId, items: batchItems, source } = parsed.data;

  const adjustSource = source || "定期盤點";

  try {
    const result = await sql.begin(async (_tx) => {
      // postgres.js v3 TransactionSql 型別不支援 tagged template，用 cast
      const tx = _tx as unknown as typeof sql;

      let successCount = 0;
      const details: { itemId: number; itemName: string; oldStock: number; newStock: number; change: number }[] = [];

      for (const entry of batchItems) {
        // 取得品項名稱
        const [item] = await tx`SELECT name FROM items WHERE id = ${entry.itemId}`;
        if (!item) continue; // 跳過不存在的品項

        // 取得目前庫存
        const [stockRow] = await tx`
          SELECT current_stock FROM store_inventory
          WHERE item_id = ${entry.itemId} AND store_id = ${storeId}
        `;
        const currentStock = parseFloat(stockRow?.current_stock as string) || 0;
        const change = entry.quantity - currentStock;

        // 如果沒差異就跳過
        if (Math.abs(change) < 0.001) continue;

        // Upsert 庫存
        const [existing] = await tx`
          SELECT id FROM store_inventory WHERE item_id = ${entry.itemId} AND store_id = ${storeId}
        `;
        if (existing) {
          await tx`
            UPDATE store_inventory
            SET current_stock = ${entry.quantity}, updated_at = NOW()
            WHERE item_id = ${entry.itemId} AND store_id = ${storeId}
          `;
        } else {
          await tx`
            INSERT INTO store_inventory (item_id, store_id, current_stock, stock_unit)
            VALUES (${entry.itemId}, ${storeId}, ${entry.quantity}, ${entry.unit || null})
          `;
        }

        // 記錄異動 log
        await tx`
          INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
          VALUES (${entry.itemId}, 'adjust', ${change}, ${entry.unit || null}, ${entry.quantity}, ${storeId}, ${adjustSource}, ${userId})
        `;

        // 同步 items.current_stock
        const [{ total }] = await tx`
          SELECT COALESCE(SUM(current_stock::numeric), 0) as total
          FROM store_inventory WHERE item_id = ${entry.itemId}
        `;
        await tx`UPDATE items SET current_stock = ${total} WHERE id = ${entry.itemId}`;

        successCount++;
        details.push({
          itemId: entry.itemId,
          itemName: item.name as string,
          oldStock: currentStock,
          newStock: entry.quantity,
          change,
        });
      }

      return { successCount, details };
    });

    return NextResponse.json({
      success: true,
      updated: result.successCount,
      total: batchItems.length,
      details: result.details,
    });
  } catch (err) {
    // Transaction 自動 rollback
    return NextResponse.json(
      { error: "批次盤點失敗，已自動回滾，請重試" },
      { status: 500 }
    );
  }
}
