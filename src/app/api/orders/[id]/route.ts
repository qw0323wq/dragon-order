/**
 * 單一訂單 API — 含明細（彙總/拆單用）
 * GET /api/orders/[id] — 讀取訂單 + 明細 + 供應商
 * PATCH /api/orders/[id] — 更新訂單狀態
 */
import { NextRequest, NextResponse } from "next/server";
import { db, rawSql } from "@/lib/db";
import { orders, orderItems, items, stores, suppliers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, requireAdmin } from "@/lib/api-auth";
import { notifyOrderSubmitted } from "@/lib/line-notify";
import { parseIntSafe } from "@/lib/parse-int-safe";
import { roundMoney } from "@/lib/format";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const orderId = parseIntSafe(id);
  if (orderId === null) {
    return NextResponse.json({ error: "無效的訂單 ID" }, { status: 400 });
  }

  // 取得訂單（JOIN users 取得建單人名稱）
  const [orderRow] = await db
    .select({
      id: orders.id,
      orderDate: orders.orderDate,
      status: orders.status,
      totalAmount: orders.totalAmount,
      notes: orders.notes,
      createdBy: orders.createdBy,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      createdByName: users.name,
    })
    .from(orders)
    .leftJoin(users, eq(orders.createdBy, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  // 向下相容：把 orderRow 當作 order 使用
  const order = orderRow;

  if (!orderRow) {
    return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  }

  // 取得訂單明細（含品項、供應商、門市名稱、叫貨人）
  // CRITICAL: LEFT JOIN receiving 帶出實收/退貨量 + 計算應付小計
  // actual_subtotal 邏輯：
  //   - 沒驗收 (r.id IS NULL) → null（前端顯示「-」）
  //   - 未到貨 → 0
  //   - 其他（正常/短缺/品質問題）→ (received_qty - returned_qty) × unit_price
  const details = await rawSql`
    SELECT oi.id, oi.quantity, oi.unit, oi.unit_price, oi.subtotal, oi.notes,
           oi.created_by as created_by_id,
           i.name as item_name, i.category as item_category, i.supplier_notes,
           s.name as supplier_name, s.id as supplier_id,
           st.name as store_name, st.id as store_id,
           u.name as created_by_name,
           r.received_qty, r.returned_qty, r.result as receiving_result,
           CASE
             WHEN r.id IS NULL THEN NULL
             WHEN r.result = '未到貨' THEN 0
             ELSE ROUND((r.received_qty - COALESCE(r.returned_qty, 0)) * oi.unit_price, 2)
           END AS actual_subtotal
    FROM order_items oi
    JOIN items i ON oi.item_id = i.id
    JOIN suppliers s ON i.supplier_id = s.id
    JOIN stores st ON oi.store_id = st.id
    LEFT JOIN users u ON oi.created_by = u.id
    LEFT JOIN receiving r ON r.order_item_id = oi.id
    WHERE oi.order_id = ${orderId}
    ORDER BY i.category, i.name
  `;

  // 轉成前端用的 camelCase
  const formattedDetails = details.map(d => ({
    id: d.id,
    quantity: d.quantity,
    unit: d.unit,
    unitPrice: d.unit_price,
    subtotal: d.subtotal,
    notes: d.notes,
    itemName: d.item_name,
    itemCategory: d.item_category,
    supplierName: d.supplier_name,
    supplierId: d.supplier_id,
    storeName: d.store_name,
    storeId: d.store_id,
    createdById: d.created_by_id,
    createdByName: d.created_by_name,
    supplierNotes: d.supplier_notes,
    // 驗收相關（沒驗收則為 null）
    receivedQty: d.received_qty ?? null,
    returnedQty: d.returned_qty ?? null,
    receivingResult: d.receiving_result ?? null,
    /** 應付小計：未驗收 → null，已驗收 → (received - returned) × unitPrice */
    actualSubtotal: d.actual_subtotal === null || d.actual_subtotal === undefined
      ? null
      : Number(d.actual_subtotal),
  }));

  return NextResponse.json({ order, details: formattedDetails });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderId = parseIntSafe(id);
  if (orderId === null) {
    return NextResponse.json({ error: "無效的訂單 ID" }, { status: 400 });
  }
  const body = await request.json();

  // ── 員工送出訂單（不需要 admin 權限）──
  if (body.action === "submit") {
    const auth = await authenticateRequest(request);
    if (!auth.ok) return auth.response;

    const [ord] = await db
      .select({ status: orders.status, createdBy: orders.createdBy })
      .from(orders)
      .where(eq(orders.id, orderId));

    if (!ord) {
      return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
    }
    if (ord.status !== "draft") {
      return NextResponse.json({ error: "只有編輯中的訂單可以送出" }, { status: 400 });
    }

    // 檢查：admin 可以送出任何訂單，其他人只能送出自己有參與的訂單
    if (auth.role !== "admin" && auth.userId) {
      const [participation] = await rawSql`
        SELECT 1 FROM order_items
        WHERE order_id = ${orderId}
          AND (created_by = ${auth.userId} ${auth.storeId ? rawSql`OR store_id = ${auth.storeId}` : rawSql``})
        LIMIT 1
      `;
      if (!participation) {
        return NextResponse.json({ error: "只能送出自己參與的訂單" }, { status: 403 });
      }
    }

    await db.update(orders).set({ status: "submitted", updatedAt: new Date() }).where(eq(orders.id, orderId));

    // LINE 通知（非阻塞，推播失敗不影響送出）
    notifyOrderSubmitted({
      userName: auth.userName || "未知",
      storeName: "門市",
      itemCount: 0,
      totalAmount: 0,
      orderDate: orderId.toString(),
    }).catch(() => {});

    return NextResponse.json({ success: true });
  }

  // ── 以下操作需要管理員權限 ──
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  // 更新訂單狀態
  if (body.status) {
    const validStatuses = ["draft", "submitted", "ordered", "receiving", "received", "closed", "cancelled"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "無效的狀態" }, { status: 400 });
    }
    await db.update(orders).set({ status: body.status, updatedAt: new Date() }).where(eq(orders.id, orderId));
    return NextResponse.json({ success: true });
  }

  // 修改品項數量
  if (body.action === "updateItem" && body.orderItemId && body.quantity !== undefined) {
    const qty = parseFloat(body.quantity);
    const [item] = await db.select({ unitPrice: orderItems.unitPrice }).from(orderItems).where(eq(orderItems.id, body.orderItemId));
    if (!item) return NextResponse.json({ error: "品項不存在" }, { status: 404 });
    await db.update(orderItems).set({
      quantity: String(qty),
      // 保留 2 位小數（numeric(10,2)）
      subtotal: roundMoney(qty * (item.unitPrice || 0)),
    }).where(eq(orderItems.id, body.orderItemId));
    // 更新訂單總金額
    await recalcOrderTotal(orderId);
    return NextResponse.json({ success: true });
  }

  // 新增品項
  if (body.action === "addItem" && body.itemId && body.storeId) {
    const [itemData] = await db.select({ costPrice: items.costPrice, unit: items.unit }).from(items).where(eq(items.id, body.itemId));
    if (!itemData) return NextResponse.json({ error: "品項不存在" }, { status: 404 });
    const qty = parseFloat(body.quantity || "1");
    const price = itemData.costPrice || 0;
    await db.insert(orderItems).values({
      orderId,
      itemId: body.itemId,
      storeId: body.storeId,
      quantity: String(qty),
      unit: body.unit || itemData.unit,
      unitPrice: price,
      // 保留 2 位小數
      subtotal: roundMoney(qty * price),
    });
    await recalcOrderTotal(orderId);
    return NextResponse.json({ success: true });
  }

  // 刪除品項
  if (body.action === "deleteItem" && body.orderItemId) {
    await db.delete(orderItems).where(eq(orderItems.id, body.orderItemId));
    await recalcOrderTotal(orderId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "無效的操作" }, { status: 400 });
}

/** DELETE — 刪除整張訂單 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const orderId = parseIntSafe(id);
  if (orderId === null) {
    return NextResponse.json({ error: "無效的訂單 ID" }, { status: 400 });
  }

  // 先刪明細再刪訂單
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
  return NextResponse.json({ success: true });
}

import { sql } from "drizzle-orm";

async function recalcOrderTotal(orderId: number) {
  const [{ total }] = await db
    .select({ total: sql<number>`COALESCE(SUM(${orderItems.subtotal}), 0)::int` })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  await db.update(orders).set({ totalAmount: total, updatedAt: new Date() }).where(eq(orders.id, orderId));
}
