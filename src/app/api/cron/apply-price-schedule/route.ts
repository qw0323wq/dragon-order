/**
 * Cron：自動執行到期的預約改價
 * GET /api/cron/apply-price-schedule
 *
 * Vercel Cron 每天 05:00 UTC+8 呼叫
 * 用 CRON_SECRET 驗證防外部觸發
 */
import { NextRequest, NextResponse } from "next/server";
import { formatDateLocal } from '@/lib/format';
import { rawSql } from "@/lib/db";

export async function GET(request: NextRequest) {
  // 驗證 CRON_SECRET（Vercel 自動帶 Authorization header）
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = formatDateLocal();

  // CRITICAL: 整個 cron 邏輯包在 transaction 內 + SELECT FOR UPDATE SKIP LOCKED
  // 防併發觸發重複套用（GitHub Actions + Vercel cron 同時跑會重疊）
  // SKIP LOCKED：其他 process 鎖住的 rows 會自動跳過，各自處理不同 rows
  try {
    const summary = await rawSql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof rawSql;

      const pending = await tx`
        SELECT id, item_id, new_cost_price, new_store_price, effective_date, source
        FROM scheduled_price_changes
        WHERE status = 'pending' AND effective_date <= ${today}
        FOR UPDATE SKIP LOCKED
      ` as unknown as Array<{
        id: number;
        item_id: number;
        new_cost_price: number;
        new_store_price: number | null;
        effective_date: string;
        source: string | null;
      }>;

      if (pending.length === 0) {
        return { applied: 0, results: [] as Array<{ itemId: number; oldPrice: number; newPrice: number; scheduleId: number }> };
      }

      let applied = 0;
      const results: { itemId: number; oldPrice: number; newPrice: number; scheduleId: number }[] = [];

      for (const schedule of pending) {
        // 取得品項現價（鎖行以保證 cost_price read-then-write 一致性）
        const [item] = await tx`
          SELECT cost_price, store_price, unit FROM items WHERE id = ${schedule.item_id} FOR UPDATE
        `;
        if (!item) continue;

        const oldPrice = parseFloat(String(item.cost_price));
        const newPrice = schedule.new_cost_price;

        // 更新品項價格
        if (schedule.new_store_price !== null) {
          await tx`
            UPDATE items SET cost_price = ${newPrice}, store_price = ${schedule.new_store_price}
            WHERE id = ${schedule.item_id}
          `;
        } else {
          await tx`UPDATE items SET cost_price = ${newPrice} WHERE id = ${schedule.item_id}`;
        }

        // 記錄價格歷史
        if (oldPrice !== newPrice && oldPrice > 0) {
          const diff = newPrice - oldPrice;
          const pct = ((diff / oldPrice) * 100).toFixed(2);

          await tx`
            INSERT INTO item_price_history
              (item_id, old_price, new_price, price_diff, change_percent, price_unit, effective_date, source)
            VALUES
              (${schedule.item_id}, ${oldPrice}, ${newPrice}, ${diff}, ${pct}, ${String(item.unit)},
               ${schedule.effective_date},
               ${schedule.source ? `預約改價：${schedule.source}` : "預約改價（自動執行）"})
          `;
        }

        // 標記排程為已執行
        await tx`
          UPDATE scheduled_price_changes SET status = 'applied', applied_at = NOW()
          WHERE id = ${schedule.id}
        `;

        applied++;
        results.push({ itemId: schedule.item_id, oldPrice, newPrice, scheduleId: schedule.id });
      }

      return { applied, results };
    });

    if (summary.applied === 0) {
      return NextResponse.json({ message: "無到期排程", applied: 0 });
    }
    return NextResponse.json({
      message: `已執行 ${summary.applied} 筆預約改價`,
      applied: summary.applied,
      results: summary.results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "預約改價執行失敗";
    return NextResponse.json({ error: msg, applied: 0 }, { status: 500 });
  }
}
