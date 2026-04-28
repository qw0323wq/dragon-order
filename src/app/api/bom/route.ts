/**
 * BOM（配方對照表）API
 *
 * GET  — 取得所有菜單商品 + BOM 明細
 * POST — 新增菜單商品（含 BOM 明細）
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { verifySession } from "@/lib/session";


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

  // 三層轉手定價：供應商 ──cost_price──▶ 總公司 ──store_price──▶ 分店 ──sell_price──▶ 客人
  //
  // 總公司毛利 = (賣給分店 - 向供應商買) / 賣給分店
  //            = (Σ qty × store_price - Σ qty × cost_price) / (Σ qty × store_price)
  // 分店毛利   = (賣給客人 - 向總公司買) / 賣給客人
  //            = (sell_price - Σ qty × store_price) / sell_price
  //
  // 角色權限：
  //   admin/buyer → 兩組都看
  //   manager     → 只看「分店毛利」（保護總公司進貨價 + 總公司利潤）
  //   staff       → 都看不到
  //
  // CRITICAL: cost_per_serving / margin_rate 兩個 DB 欄位是 stale 的（沒同步機制），
  //           改成即時從 BOM 食材 × 對應 item 價格累加
  const showHq = userRole === "admin" || userRole === "buyer";
  const showStore =
    userRole === "admin" || userRole === "buyer" || userRole === "manager";

  const result = menuItems.map((mi) => {
    const ings = bomMap[mi.id as number] || [];

    let hqCostSum = 0;      // 總公司向供應商買
    let hqRevenueSum = 0;   // 總公司賣給分店（= 分店向總公司買）
    let hasUnknownIngredient = false;
    for (const b of ings) {
      const qty = parseFloat(String(b.quantity)) || 0;
      if (!b.item_id || qty <= 0) {
        hasUnknownIngredient = true;
        continue;
      }
      const cp = Number(b.item_cost) || 0;
      const sp = Number(b.item_store_price) || 0;
      hqCostSum += qty * cp;
      hqRevenueSum += qty * effectiveStorePrice(cp, sp);
    }

    const sellPrice = Number(mi.sell_price) || 0;
    // 保留 2 位小數
    const hqCost = Math.round(hqCostSum * 100) / 100;
    const hqRevenue = Math.round(hqRevenueSum * 100) / 100;
    const storeCost = hqRevenue; // 分店向總公司採購 = 總公司賣給分店

    // 毛利率：0~1
    const hqMargin =
      hqRevenue > 0 && hqCost > 0 ? (hqRevenue - hqCost) / hqRevenue : 0;
    const storeMargin =
      sellPrice > 0 && storeCost > 0 ? (sellPrice - storeCost) / sellPrice : 0;

    return {
      id: mi.id,
      name: mi.name,
      category: mi.category,
      sellPrice,
      hqCost: showHq ? hqCost : 0,
      hqRevenue: showHq ? hqRevenue : 0,
      hqMargin: showHq ? hqMargin : 0,
      storeCost: showStore ? storeCost : 0,
      storeMargin: showStore ? storeMargin : 0,
      hasUnknownIngredient,
      notes: mi.notes,
      isActive: mi.is_active,
      ingredients: ings.map((b) => {
        const cp = Number(b.item_cost) || 0;
        const sp = Number(b.item_store_price) || 0;
        const sCost = effectiveStorePrice(cp, sp);
        // 主要顯示用（保留向後相容）
        let displayCost = 0;
        if (userRole === "admin" || userRole === "buyer") {
          displayCost = cp;
        } else if (userRole === "manager") {
          displayCost = sCost;
        }
        return {
          id: b.id,
          ingredientName: b.ingredient_name,
          quantity: b.quantity,
          itemId: b.item_id,
          itemName: b.item_name,
          itemUnit: b.item_unit,
          itemCost: displayCost,
          hqCost: showHq ? cp : 0,
          storeCost: showStore ? sCost : 0,
        };
      }),
    };
  });

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
