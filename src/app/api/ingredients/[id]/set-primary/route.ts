/**
 * PATCH /api/ingredients/[id]/set-primary
 *
 * 切換該 ingredient 的主供應商
 * Body: { itemId: number }
 *
 * 邏輯：把該 ingredient 下所有 items.is_primary 設為 false，
 *      再把指定的 item 設為 true（必須是該 ingredient 的 SKU）
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "僅管理員可調整主供應商" }, { status: 403 });
  }

  const { id } = await params;
  const ingId = parseIntSafe(id);
  if (ingId === null) return NextResponse.json({ error: "無效的 ingredient ID" }, { status: 400 });

  const body = await request.json();
  const itemId = parseIntSafe(String(body.itemId));
  if (itemId === null) return NextResponse.json({ error: "無效的 itemId" }, { status: 400 });

  // 驗證：itemId 必須屬於該 ingredient
  const [item] = await sql`
    SELECT id, ingredient_id FROM items WHERE id = ${itemId}
  ` as unknown as Array<{ id: number; ingredient_id: number | null }>;
  if (!item || item.ingredient_id !== ingId) {
    return NextResponse.json(
      { error: "該 item 不屬於此 ingredient" },
      { status: 400 }
    );
  }

  // 包 transaction：清空舊主家 + 設新主家
  try {
    await sql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof sql;
      await tx`UPDATE items SET is_primary = false WHERE ingredient_id = ${ingId}`;
      await tx`UPDATE items SET is_primary = true WHERE id = ${itemId}`;
    });
    return NextResponse.json({ message: "已更新主供應商" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "更新失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
