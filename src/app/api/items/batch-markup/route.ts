/**
 * 批次設定店家採購價加成 %
 * PATCH /api/items/batch-markup
 *
 * Body: {
 *   category?: string | null   // 分類；null 或 '全部' = 所有 active 品項
 *   markupPct: number          // 要套用的加成 %（如 25）
 *   clearManual?: boolean      // 是否同時清除手動固定價（store_price → 0），讓該分類全部改吃加成 %
 * }
 *
 * 回傳：{ updated: n, manualKept: m }
 *   - updated：被改到 markup 的品項數
 *   - manualKept：有手動固定價、且沒勾 clearManual 而維持原價的品項數（不受加成影響，提醒用）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { category, markupPct, clearManual } = body as {
    category?: string | null;
    markupPct: number;
    clearManual?: boolean;
  };

  // 驗證加成 %
  const pct = Number(markupPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 1000) {
    return NextResponse.json({ error: "加成 % 需為 0~1000 的數字" }, { status: 400 });
  }

  // 分類條件：null / '全部' / 空 → 所有 active
  const isAll = !category || category === "全部";
  const scopeCond = isAll
    ? eq(items.isActive, true)
    : and(eq(items.isActive, true), eq(items.category, category));

  // 先算這個範圍內「有手動固定價（store_price > 0）」的數量（提醒用）
  const [{ manualCount }] = await db
    .select({ manualCount: sql<number>`COUNT(*)::int` })
    .from(items)
    .where(and(scopeCond, gt(items.storePrice, 0)));

  // 更新加成 %；若 clearManual 一併把手動固定價歸 0
  const updates: Record<string, unknown> = { storeMarkupPct: pct };
  if (clearManual) updates.storePrice = 0;

  const updated = await db
    .update(items)
    .set(updates)
    .where(scopeCond)
    .returning({ id: items.id });

  return NextResponse.json({
    updated: updated.length,
    // 有手動價又沒清除 → 這些品項的加成 % 改了但實際採購價不變（仍用手動價）
    manualKept: clearManual ? 0 : Number(manualCount),
  });
}
