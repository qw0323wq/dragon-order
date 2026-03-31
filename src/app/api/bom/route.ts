/**
 * BOM（配方對照表）API
 *
 * GET  — 取得所有菜單商品 + BOM 明細
 * POST — 新增菜單商品（含 BOM 明細）
 */
import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { authenticateRequest } from "@/lib/api-auth";
import { verifySession } from "@/lib/session";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  // 取得所有菜單商品
  const menuItems = await sql`
    SELECT id, name, category, sell_price, cost_per_serving, margin_rate, notes, is_active
    FROM menu_items WHERE is_active = true ORDER BY category, name
  `;

  // 取得所有 BOM 明細（含進貨價 + 店家採購價）
  const bomItems = await sql`
    SELECT bi.id, bi.menu_item_id, bi.item_id, bi.ingredient_name, bi.quantity, bi.sort_order,
           i.name as item_name, i.unit as item_unit, i.cost_price as item_cost, i.store_price as item_store_price
    FROM bom_items bi
    LEFT JOIN items i ON bi.item_id = i.id
    ORDER BY bi.menu_item_id, bi.sort_order
  `;

  // 組合成巢狀結構
  type BomRow = (typeof bomItems)[number];
  const bomMap: Record<number, BomRow[]> = {};
  for (const bom of bomItems) {
    const mid = bom.menu_item_id as number;
    if (!bomMap[mid]) bomMap[mid] = [];
    bomMap[mid].push(bom);
  }

  // 判斷使用者角色
  let userRole = "staff";
  if (auth.source === "cookie") {
    const session = verifySession<{ role: string }>(request.cookies.get("dragon-session")?.value || "");
    userRole = session?.role || "staff";
  } else if (auth.source === "system-key") {
    userRole = auth.role === "admin" ? "admin" : "staff";
  } else if (auth.source === "personal-token") {
    userRole = auth.role === "admin" ? "admin" : "staff";
  }

  const costMarkup = parseFloat(process.env.COST_MARKUP || "1.2");

  function effectiveStorePrice(costPrice: number, storePrice: number): number {
    return storePrice > 0 ? storePrice : Math.round(costPrice * costMarkup);
  }

  const canSeeCost = userRole === "admin" || userRole === "buyer" || userRole === "manager";

  const result = menuItems.map((mi) => ({
    id: mi.id,
    name: mi.name,
    category: mi.category,
    sellPrice: mi.sell_price,
    costPerServing: canSeeCost ? Number(mi.cost_per_serving) : 0,
    marginRate: canSeeCost ? Number(mi.margin_rate) : 0,
    notes: mi.notes,
    isActive: mi.is_active,
    ingredients: (bomMap[mi.id as number] || []).map((b) => {
      const rawCost = Number(b.item_cost || 0);
      const rawStorePrice = Number(b.item_store_price || 0);
      let displayCost = 0;
      if (userRole === "admin" || userRole === "buyer") {
        displayCost = rawCost;
      } else if (userRole === "manager") {
        displayCost = effectiveStorePrice(rawCost, rawStorePrice);
      }
      return {
        id: b.id,
        ingredientName: b.ingredient_name,
        quantity: b.quantity,
        itemId: b.item_id,
        itemName: b.item_name,
        itemUnit: b.item_unit,
        itemCost: displayCost,
      };
    }),
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "僅管理員可新增菜品" }, { status: 403 });
  }

  const body = await request.json();
  const { name, category, sellPrice, costPerServing, marginRate, notes, ingredients } = body;

  if (!name || !category) {
    return NextResponse.json({ error: "名稱和分類為必填" }, { status: 400 });
  }

  const [menuItem] = await sql`
    INSERT INTO menu_items (name, category, sell_price, cost_per_serving, margin_rate, notes)
    VALUES (${name}, ${category}, ${sellPrice || 0}, ${costPerServing || 0}, ${marginRate || 0}, ${notes || null})
    RETURNING id
  `;

  if (ingredients && Array.isArray(ingredients)) {
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      await sql`
        INSERT INTO bom_items (menu_item_id, item_id, ingredient_name, quantity, sort_order)
        VALUES (${menuItem.id}, ${ing.itemId || null}, ${ing.ingredientName}, ${ing.quantity}, ${i + 1})
      `;
    }
  }

  return NextResponse.json({ id: menuItem.id, message: "已新增" }, { status: 201 });
}
