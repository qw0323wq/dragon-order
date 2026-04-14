/**
 * Cron：自動執行到期的預約改價
 * GET /api/cron/apply-price-schedule
 *
 * Vercel Cron 每天 05:00 UTC+8 呼叫
 * 用 CRON_SECRET 驗證防外部觸發
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledPriceChanges, items, itemPriceHistory } from "@/lib/db/schema";
import { eq, and, lte, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  // 驗證 CRON_SECRET（Vercel 自動帶 Authorization header）
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // 查詢到期的 pending 排程
  const pending = await db
    .select({
      id: scheduledPriceChanges.id,
      itemId: scheduledPriceChanges.itemId,
      newCostPrice: scheduledPriceChanges.newCostPrice,
      newStorePrice: scheduledPriceChanges.newStorePrice,
      effectiveDate: scheduledPriceChanges.effectiveDate,
      source: scheduledPriceChanges.source,
    })
    .from(scheduledPriceChanges)
    .where(
      and(
        eq(scheduledPriceChanges.status, "pending"),
        lte(scheduledPriceChanges.effectiveDate, today),
      )
    );

  if (pending.length === 0) {
    return NextResponse.json({ message: "無到期排程", applied: 0 });
  }

  let applied = 0;
  const results: { itemId: number; oldPrice: number; newPrice: number; scheduleId: number }[] = [];

  for (const schedule of pending) {
    // 取得品項現價
    const [item] = await db
      .select({ costPrice: items.costPrice, storePrice: items.storePrice, unit: items.unit })
      .from(items)
      .where(eq(items.id, schedule.itemId));

    if (!item) continue;

    const oldPrice = item.costPrice;
    const newPrice = schedule.newCostPrice;

    // 更新品項價格
    const updateFields: Record<string, unknown> = { costPrice: newPrice };
    if (schedule.newStorePrice !== null) {
      updateFields.storePrice = schedule.newStorePrice;
    }

    await db.update(items).set(updateFields).where(eq(items.id, schedule.itemId));

    // 記錄價格歷史
    if (oldPrice !== newPrice && oldPrice > 0) {
      const diff = newPrice - oldPrice;
      const pct = ((diff / oldPrice) * 100).toFixed(2);

      await db.insert(itemPriceHistory).values({
        itemId: schedule.itemId,
        oldPrice,
        newPrice,
        priceDiff: diff,
        changePercent: pct,
        priceUnit: item.unit,
        effectiveDate: schedule.effectiveDate,
        source: schedule.source ? `預約改價：${schedule.source}` : "預約改價（自動執行）",
      });
    }

    // 標記排程為已執行
    await db
      .update(scheduledPriceChanges)
      .set({ status: "applied", appliedAt: sql`NOW()` })
      .where(eq(scheduledPriceChanges.id, schedule.id));

    applied++;
    results.push({ itemId: schedule.itemId, oldPrice, newPrice, scheduleId: schedule.id });
  }

  return NextResponse.json({
    message: `已執行 ${applied} 筆預約改價`,
    applied,
    results,
  });
}
