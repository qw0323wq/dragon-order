/**
 * 單一菜單商品 BOM API
 *
 * PUT    /api/bom/[id] — 更新菜品資訊 + BOM 明細（全量覆蓋）
 * DELETE /api/bom/[id] — 刪除菜品（cascade 刪除 BOM 明細）
 */
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { authenticateRequest } from "@/lib/api-auth";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "僅管理員可修改菜品" }, { status: 403 });
  }

  const { id } = await params;
  const menuItemId = parseInt(id);
  if (isNaN(menuItemId)) {
    return NextResponse.json({ error: "無效的 ID" }, { status: 400 });
  }

  const body = await request.json();
  const { name, category, sellPrice, notes, ingredients } = body;

  // 確認菜品存在
  const [existing] = await sql`SELECT id FROM menu_items WHERE id = ${menuItemId}`;
  if (!existing) {
    return NextResponse.json({ error: "菜品不存在" }, { status: 404 });
  }

  // 更新菜品資訊
  if (name !== undefined || category !== undefined || sellPrice !== undefined || notes !== undefined) {
    await sql`
      UPDATE menu_items SET
        name = COALESCE(${name ?? null}, name),
        category = COALESCE(${category ?? null}, category),
        sell_price = COALESCE(${sellPrice ?? null}, sell_price),
        notes = ${notes ?? null}
      WHERE id = ${menuItemId}
    `;
  }

  // 如果有提供 ingredients，全量覆蓋 BOM 明細
  if (ingredients && Array.isArray(ingredients)) {
    await sql`DELETE FROM bom_items WHERE menu_item_id = ${menuItemId}`;

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.ingredientName) continue;
      await sql`
        INSERT INTO bom_items (menu_item_id, item_id, ingredient_name, quantity, sort_order)
        VALUES (${menuItemId}, ${ing.itemId || null}, ${ing.ingredientName}, ${ing.quantity || ''}, ${i + 1})
      `;
    }
  }

  return NextResponse.json({ message: "已更新" });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "僅管理員可刪除菜品" }, { status: 403 });
  }

  const { id } = await params;
  const menuItemId = parseInt(id);
  if (isNaN(menuItemId)) {
    return NextResponse.json({ error: "無效的 ID" }, { status: 400 });
  }

  const [deleted] = await sql`DELETE FROM menu_items WHERE id = ${menuItemId} RETURNING id`;
  if (!deleted) {
    return NextResponse.json({ error: "菜品不存在" }, { status: 404 });
  }

  return NextResponse.json({ message: "已刪除" });
}
