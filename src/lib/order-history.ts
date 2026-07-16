/**
 * 訂單狀態歷史寫入 helper
 *
 * 所有改變 orders.status 的地方都應同時呼叫 logOrderStatus()，
 * 讓「歷史紀錄」時間線完整。寫入失敗只記 log 不拋錯 —
 * 歷史是輔助資訊，不能因為它讓主流程（送單/驗收）失敗。
 */
import { db } from '@/lib/db';
import { orderStatusHistory } from '@/lib/db/schema';

export async function logOrderStatus(
  orderId: number,
  status: string,
  changedBy?: number | null,
  note?: string
): Promise<void> {
  try {
    await db.insert(orderStatusHistory).values({
      orderId,
      status,
      changedBy: changedBy ?? null,
      note: note ?? null,
    });
  } catch (err) {
    console.error('[order-history] 寫入狀態歷史失敗（不影響主流程）:', err);
  }
}
