/**
 * 門市調撥/借料 API
 *
 * GET  /api/transfers              — 查詢調撥紀錄
 * POST /api/transfers              — 新增調撥/借料
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest, requireManagerOrAbove } from "@/lib/api-auth";
import { createTransferSchema, parseBody } from "@/lib/validations";
import { verifySession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // pending|confirmed|returned|settled
  const storeId = searchParams.get("store_id"); // 只看某店相關

  let rows;
  if (storeId) {
    const sid = parseInt(storeId);
    rows = await sql`
      SELECT t.*,
             fs.name as from_store_name, ts.name as to_store_name,
             u.name as created_by_name
      FROM transfers t
      JOIN stores fs ON t.from_store_id = fs.id
      JOIN stores ts ON t.to_store_id = ts.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE (t.from_store_id = ${sid} OR t.to_store_id = ${sid})
      ${status ? sql`AND t.status = ${status}` : sql``}
      ORDER BY t.created_at DESC
      LIMIT 100
    `;
  } else {
    rows = await sql`
      SELECT t.*,
             fs.name as from_store_name, ts.name as to_store_name,
             u.name as created_by_name
      FROM transfers t
      JOIN stores fs ON t.from_store_id = fs.id
      JOIN stores ts ON t.to_store_id = ts.id
      LEFT JOIN users u ON t.created_by = u.id
      ${status ? sql`WHERE t.status = ${status}` : sql``}
      ORDER BY t.created_at DESC
      LIMIT 100
    `;
  }

  // 一次查出所有調撥明細（避免 N+1）
  const transferIds = rows.map((t) => t.id);
  const allItems = transferIds.length > 0
    ? await sql`
        SELECT ti.*, i.name as item_name, i.unit as item_unit
        FROM transfer_items ti
        JOIN items i ON ti.item_id = i.id
        WHERE ti.transfer_id = ANY(${transferIds})
      `
    : ([] as Record<string, unknown>[]);

  // 按 transfer_id 分組
  const itemsByTransfer = new Map<number, Record<string, unknown>[]>();
  for (const item of allItems) {
    const tid = item.transfer_id as number;
    const list = itemsByTransfer.get(tid) ?? [];
    list.push(item);
    itemsByTransfer.set(tid, list);
  }

  const result = rows.map((t) => ({
    ...t,
    items: (itemsByTransfer.get(t.id as number) ?? []).map((i) => ({
      ...i,
      quantity: parseFloat(i.quantity as string) || 0,
      returned_qty: parseFloat(i.returned_qty as string) || 0,
    })),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  // CRITICAL: 調撥操作需要 manager 以上權限
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;

  let userId: number | null = null;
  if (auth.source === "cookie") {
    const session = verifySession<{ id: number }>(
      request.cookies.get("dragon-session")?.value || ""
    );
    userId = session?.id ?? null;
  }

  const body = await request.json();
  const parsed = parseBody(createTransferSchema, body);
  if (!parsed.ok) return parsed.response;
  const { type, fromStoreId, toStoreId, items, notes } = parsed.data;

  if (fromStoreId === toStoreId) {
    return NextResponse.json(
      { error: "來源和目標不能相同" },
      { status: 400 }
    );
  }

  // CRITICAL: 整個調撥操作包在 transaction 內，確保原子性
  // 避免中途失敗造成庫存不一致（如：來源已扣但目標未加）
  try {
    const result = await sql.begin(async (_tx) => {
      // postgres.js v3 TransactionSql 型別不支援 tagged template，用 any cast
      const tx = _tx as unknown as typeof sql;
      // 產生調撥單號
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const [{ count }] = await tx`
        SELECT COUNT(*)::int as count FROM transfers
        WHERE transfer_number LIKE ${"TR-" + today + "%"}
      `;
      const seq = String(count + 1).padStart(3, "0");
      const transferNumber = `TR-${today}-${seq}`;

      // 建立調撥單
      const [transfer] = await tx`
        INSERT INTO transfers (transfer_number, type, from_store_id, to_store_id, status, notes, created_by)
        VALUES (${transferNumber}, ${type}, ${fromStoreId}, ${toStoreId}, 'confirmed', ${notes || null}, ${userId})
        RETURNING id
      `;

      // 建立明細 + 更新庫存
      for (const item of items) {
        await tx`
          INSERT INTO transfer_items (transfer_id, item_id, quantity, unit)
          VALUES (${transfer.id}, ${item.itemId}, ${item.quantity}, ${item.unit || null})
        `;

        // 來源扣庫存
        const [fromExisting] = await tx`
          SELECT id FROM store_inventory WHERE item_id = ${item.itemId} AND store_id = ${fromStoreId}
        `;
        if (fromExisting) {
          await tx`UPDATE store_inventory SET current_stock = current_stock - ${item.quantity}, updated_at = NOW() WHERE item_id = ${item.itemId} AND store_id = ${fromStoreId}`;
        }

        // 目標加庫存
        const [toExisting] = await tx`
          SELECT id FROM store_inventory WHERE item_id = ${item.itemId} AND store_id = ${toStoreId}
        `;
        if (toExisting) {
          await tx`UPDATE store_inventory SET current_stock = current_stock + ${item.quantity}, updated_at = NOW() WHERE item_id = ${item.itemId} AND store_id = ${toStoreId}`;
        } else {
          await tx`INSERT INTO store_inventory (item_id, store_id, current_stock, stock_unit) VALUES (${item.itemId}, ${toStoreId}, ${item.quantity}, ${item.unit || null})`;
        }

        // 記錄庫存異動 log
        const [fromStock] = await tx`SELECT current_stock FROM store_inventory WHERE item_id = ${item.itemId} AND store_id = ${fromStoreId}`;
        const [toStock] = await tx`SELECT current_stock FROM store_inventory WHERE item_id = ${item.itemId} AND store_id = ${toStoreId}`;

        const label = type === "borrow" ? "借料" : "調撥";
        await tx`
          INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
          VALUES (${item.itemId}, 'out', ${-item.quantity}, ${item.unit || null}, ${fromStock?.current_stock || 0}, ${fromStoreId}, ${label + '轉出 ' + transferNumber}, ${userId})
        `;
        await tx`
          INSERT INTO inventory_logs (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
          VALUES (${item.itemId}, 'in', ${item.quantity}, ${item.unit || null}, ${toStock?.current_stock || 0}, ${toStoreId}, ${label + '轉入 ' + transferNumber}, ${userId})
        `;
      }

      return { transferNumber, id: transfer.id };
    });

    return NextResponse.json({
      success: true,
      transferNumber: result.transferNumber,
      id: result.id,
      type,
      itemCount: items.length,
    });
  } catch (err) {
    // Transaction 自動 rollback，庫存不會不一致
    return NextResponse.json(
      { error: "調撥失敗，已自動回滾" },
      { status: 500 }
    );
  }
}
