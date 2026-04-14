/**
 * 預約改價排程 — 單筆操作
 * PATCH /api/price-schedule/[id] — 修改排程（可改價格/日期/取消）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledPriceChanges } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const scheduleId = parseIntSafe(id);
  if (scheduleId === null) {
    return NextResponse.json({ error: "無效的排程 ID" }, { status: 400 });
  }

  // 確認排程存在且為 pending
  const [existing] = await db
    .select({ id: scheduledPriceChanges.id, status: scheduledPriceChanges.status })
    .from(scheduledPriceChanges)
    .where(eq(scheduledPriceChanges.id, scheduleId));

  if (!existing) {
    return NextResponse.json({ error: "找不到排程" }, { status: 404 });
  }

  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: `排程狀態為「${existing.status}」，無法修改` },
      { status: 400 }
    );
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.newCostPrice !== undefined) updates.newCostPrice = body.newCostPrice;
  if (body.newStorePrice !== undefined) updates.newStorePrice = body.newStorePrice;
  if (body.effectiveDate !== undefined) updates.effectiveDate = body.effectiveDate;
  if (body.source !== undefined) updates.source = body.source;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.status === "cancelled") updates.status = "cancelled";

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });
  }

  const [updated] = await db
    .update(scheduledPriceChanges)
    .set(updates)
    .where(eq(scheduledPriceChanges.id, scheduleId))
    .returning();

  return NextResponse.json(updated);
}
