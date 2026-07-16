/**
 * 訂單狀態歷史 API
 * GET /api/orders/[id]/history — 回傳該訂單的狀態變化時間線（新→舊）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderStatusHistory, users, orders } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

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

  const [order] = await db
    .select({ id: orders.id, createdAt: orders.createdAt, createdBy: orders.createdBy })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) {
    return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: orderStatusHistory.id,
      status: orderStatusHistory.status,
      note: orderStatusHistory.note,
      createdAt: orderStatusHistory.createdAt,
      changedByName: users.name,
    })
    .from(orderStatusHistory)
    .leftJoin(users, eq(orderStatusHistory.changedBy, users.id))
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(desc(orderStatusHistory.createdAt));

  // 舊訂單（歷史表上線前建立）沒有 draft 紀錄 → 用 orders.createdAt 合成「訂單建立」首筆
  const hasCreationEntry = rows.some((r) => r.status === "draft");
  const events = hasCreationEntry
    ? rows
    : [
        ...rows,
        {
          id: 0,
          status: "draft",
          note: "訂單建立",
          createdAt: order.createdAt,
          changedByName: null,
        },
      ];

  return NextResponse.json({ events });
}
