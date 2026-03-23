/**
 * BOM（配方對照表）API
 *
 * GET  — 取得所有菜單商品 + BOM 明細
 * POST — 新增菜單商品（含 BOM 明細）
 */
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticateRequest } from "@/lib/api-auth";

function getSQL() {
  return neon(process.env.DATABASE_URL!);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const sql = getSQL();

  // 取得所有菜單商品
  const menuItems = await sql.query(
    "SELECT id, name, category, sell_price, cost_per_serving, margin_rate, notes, is_active FROM menu_items ORDER BY category, name"
  );

  // 取得所有 BOM 明細
  const bomItems = await sql.query(
    `SELECT bi.id, bi.menu_item_id, bi.item_id, bi.ingredient_name, bi.quantity, bi.sort_order,
            i.name as item_name, i.unit as item_unit, i.cost_price as item_cost
     FROM bom_items bi
     LEFT JOIN items i ON bi.item_id = i.id
     ORDER BY bi.menu_item_id, bi.sort_order`
  );

  // 組合成巢狀結構
  const bomMap: Record<number, typeof bomItems> = {};
  for (const bom of bomItems) {
    const mid = bom.menu_item_id as number;
    if (!bomMap[mid]) bomMap[mid] = [];
    bomMap[mid].push(bom);
  }

  // 判斷使用者角色（cookie 或 API token）
  let userRole = "staff";
  if (auth.source === "cookie") {
    try {
      const session = JSON.parse(request.cookies.get("dragon-session")?.value || "{}");
      userRole = session.role || "staff";
    } catch { /* keep staff */ }
  } else if (auth.source === "system-key") {
    userRole = auth.role === "admin" ? "owner" : "staff";
  } else if (auth.source === "personal-token") {
    userRole = auth.role === "admin" ? "owner" : "staff";
  }
  const result = menuItems.map((mi) => ({
    id: mi.id,
    name: mi.name,
    category: mi.category,
    sellPrice: mi.sell_price,
    costPerServing:
      userRole === "owner" || userRole === "manager"
        ? Number(mi.cost_per_serving)
        : 0,
    marginRate:
      userRole === "owner" || userRole === "manager" ? Number(mi.margin_rate) : 0,
    notes: mi.notes,
    isActive: mi.is_active,
    ingredients: (bomMap[mi.id as number] || []).map((b) => ({
      id: b.id,
      ingredientName: b.ingredient_name,
      quantity: b.quantity,
      itemId: b.item_id,
      itemName: b.item_name,
      itemUnit: b.item_unit,
      itemCost:
        userRole === "owner" || userRole === "manager" ? Number(b.item_cost || 0) : 0,
    })),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "僅老闆可新增菜品" }, { status: 403 });
  }

  const body = await request.json();
  const { name, category, sellPrice, costPerServing, marginRate, notes, ingredients } = body;

  if (!name || !category) {
    return NextResponse.json({ error: "名稱和分類為必填" }, { status: 400 });
  }

  const sql = getSQL();

  // 插入菜單商品
  const menuResult = await sql.query(
    "INSERT INTO menu_items (name, category, sell_price, cost_per_serving, margin_rate, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [name, category, sellPrice || 0, costPerServing || 0, marginRate || 0, notes || null]
  );
  const menuItem = menuResult[0];

  // 插入 BOM 明細
  if (ingredients && Array.isArray(ingredients)) {
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      await sql.query(
        "INSERT INTO bom_items (menu_item_id, item_id, ingredient_name, quantity, sort_order) VALUES ($1, $2, $3, $4, $5)",
        [menuItem.id, ing.itemId || null, ing.ingredientName, ing.quantity, i + 1]
      );
    }
  }

  return NextResponse.json({ id: menuItem.id, message: "已新增" }, { status: 201 });
}
