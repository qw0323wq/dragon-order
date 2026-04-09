/**
 * GET /api/my-orders — 員工查看自己的訂單（含品項明細）
 * 自動根據 session 的 userId + storeId 過濾
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { verifySession } from "@/lib/session";


export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  // 從 session 取 userId + storeId
  let userId: number | null = null;
  let storeId: number | null = null;

  if (auth.source === "cookie") {
    const session = verifySession<{ id: number; store_id: number | null }>(
      request.cookies.get("dragon-session")?.value || ""
    );
    userId = session?.id ?? null;
    storeId = session?.store_id ?? null;
  } else {
    userId = auth.userId ?? null;
    storeId = auth.storeId ?? null;
  }

  const isAdmin = !userId || auth.source === "system-key";

  // 查訂單
  const orders = isAdmin
    ? await sql`
        SELECT o.id, o.order_date, o.status, o.total_amount, o.created_at
        FROM orders o ORDER BY o.order_date DESC LIMIT 10
      `
    : await sql`
        SELECT DISTINCT o.id, o.order_date, o.status, o.total_amount, o.created_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.created_by = ${userId} ${storeId ? sql`OR oi.store_id = ${storeId}` : sql``}
        ORDER BY o.order_date DESC, o.created_at DESC
        LIMIT 10
      `;

  // 每張訂單的品項明細
  const result = [];
  for (const o of orders) {
    const items = isAdmin
      ? await sql`
          SELECT oi.id, oi.quantity, oi.unit, oi.created_by,
                 i.name as item_name, u.name as created_by_name
          FROM order_items oi
          JOIN items i ON oi.item_id = i.id
          LEFT JOIN users u ON oi.created_by = u.id
          WHERE oi.order_id = ${o.id}
          ORDER BY i.name
        `
      : await sql`
          SELECT oi.id, oi.quantity, oi.unit, oi.created_by,
                 i.name as item_name, u.name as created_by_name
          FROM order_items oi
          JOIN items i ON oi.item_id = i.id
          LEFT JOIN users u ON oi.created_by = u.id
          WHERE oi.order_id = ${o.id}
            AND (oi.created_by = ${userId} ${storeId ? sql`OR oi.store_id = ${storeId}` : sql``})
          ORDER BY i.name
        `;

    if (items.length === 0) continue;

    result.push({
      id: o.id,
      orderDate: (o.order_date as Date)?.toISOString?.()?.slice(0, 10) || String(o.order_date).slice(0, 10),
      status: o.status,
      totalAmount: o.total_amount,
      items: items.map(i => ({
        itemName: i.item_name,
        quantity: i.quantity,
        unit: i.unit,
        createdByName: i.created_by_name,
      })),
    });
  }

  return NextResponse.json(result);
}
