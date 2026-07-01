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
import { getEffectiveStorePrice, DEFAULT_STORE_MARKUP_PCT } from "@/lib/permissions";


export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  // ?includeInactive=true → 連已下架的也回（給後台看用）
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  // 取得所有菜單商品（預設只 active，後台可開關看所有）
  const menuItems = includeInactive
    ? await sql`
        SELECT id, name, category, sell_price, cost_per_serving, margin_rate, notes, is_active
        FROM menu_items ORDER BY is_active DESC, category, name
      `
    : await sql`
        SELECT id, name, category, sell_price, cost_per_serving, margin_rate, notes, is_active
        FROM menu_items WHERE is_active = true ORDER BY category, name
      `;

  // 取得所有 BOM 明細
  // CRITICAL: 三層架構 — BOM 成本用 ingredient 的「主供應商」算（is_primary = true）
  // 同食材多家供應商時，cost 取主家的 cost_price；切換供應商不用改 BOM
  //
  // 計算優先順序：
  //   1. ingredient 主供應商（is_primary=true 且 active 且 cost>0）
  //   2. ingredient 任一 active 供應商（cost_price 最低的）
  //   3. 舊 item_id 對應的價（向下相容）
  //   4. 0（食材沒對應 SKU 或都無價）
  //
  // quantity_value fallback 順序：
  //   1. bi.quantity_value（已拆好的 numeric）
  //   2. parseFloat(bi.quantity)（簡單字串轉數字）
  //   3. 跳過該行（標 hasUnknownIngredient）
  const bomItems = await sql`
    SELECT bi.id, bi.menu_item_id, bi.item_id, bi.ingredient_id, bi.ingredient_name,
           bi.quantity, bi.quantity_value, bi.quantity_unit, bi.sort_order,
           -- 主供應商（preferred）
           prim.id           as primary_item_id,
           prim.name         as primary_item_name,
           prim.unit         as primary_item_unit,
           prim.cost_price   as primary_cost,
           prim.store_price  as primary_store_price,
           prim.store_markup_pct as primary_markup_pct,
           -- 同 ingredient 的供應商數量
           (SELECT COUNT(*)::int FROM items
            WHERE ingredient_id = bi.ingredient_id AND is_active = true) as supplier_count,
           -- fallback：舊 item_id 對應的價
           fb.name           as fb_item_name,
           fb.unit           as fb_item_unit,
           fb.cost_price     as fb_item_cost,
           fb.store_price    as fb_item_store_price,
           fb.store_markup_pct as fb_markup_pct
    FROM bom_items bi
    LEFT JOIN LATERAL (
      SELECT id, name, unit, cost_price, store_price, store_markup_pct
      FROM items
      WHERE ingredient_id = bi.ingredient_id AND is_primary = true AND is_active = true AND cost_price > 0
      ORDER BY cost_price ASC, id ASC
      LIMIT 1
    ) prim ON true
    LEFT JOIN items fb ON bi.item_id = fb.id
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

  // 店家採購價：手動固定價優先，否則進貨價 × (1 + 該品項加成%/100)
  function effectiveStorePrice(costPrice: number, storePrice: number, markupPct: number): number {
    return getEffectiveStorePrice(costPrice, storePrice, markupPct);
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

  /** 取單筆 BOM 行的「最佳價」（cost + store） + 用量 */
  function resolveBomRow(b: Record<string, unknown>): {
    qtyValue: number;
    costPrice: number;
    storePrice: number;
    markupPct: number;
    sourceItemName: string | null;
    sourceItemUnit: string | null;
    sourceLevel: "primary" | "fallback" | "none";
    supplierCount: number;
  } {
    // 用量：先用拆出的 quantity_value，再 fallback parseFloat
    let qtyValue = 0;
    if (b.quantity_value != null) qtyValue = parseFloat(String(b.quantity_value));
    if (!qtyValue || isNaN(qtyValue)) qtyValue = parseFloat(String(b.quantity)) || 0;

    // 價格：先主供應商，再 fallback 舊 item_id
    let costPrice = 0;
    let storePrice = 0;
    let markupPct = DEFAULT_STORE_MARKUP_PCT;
    let sourceItemName: string | null = null;
    let sourceItemUnit: string | null = null;
    let sourceLevel: "primary" | "fallback" | "none" = "none";

    const primCost = b.primary_cost != null ? Number(b.primary_cost) : 0;
    if (primCost > 0) {
      costPrice = primCost;
      storePrice = Number(b.primary_store_price ?? 0);
      markupPct = b.primary_markup_pct != null ? Number(b.primary_markup_pct) : DEFAULT_STORE_MARKUP_PCT;
      sourceItemName = String(b.primary_item_name ?? "");
      sourceItemUnit = String(b.primary_item_unit ?? "");
      sourceLevel = "primary";
    } else {
      const fbCost = b.fb_item_cost != null ? Number(b.fb_item_cost) : 0;
      if (fbCost > 0) {
        costPrice = fbCost;
        storePrice = Number(b.fb_item_store_price ?? 0);
        markupPct = b.fb_markup_pct != null ? Number(b.fb_markup_pct) : DEFAULT_STORE_MARKUP_PCT;
        sourceItemName = String(b.fb_item_name ?? "");
        sourceItemUnit = String(b.fb_item_unit ?? "");
        sourceLevel = "fallback";
      }
    }

    return {
      qtyValue,
      costPrice,
      storePrice,
      markupPct,
      sourceItemName,
      sourceItemUnit,
      sourceLevel,
      supplierCount: Number(b.supplier_count ?? 0),
    };
  }

  const result = menuItems.map((mi) => {
    const ings = bomMap[mi.id as number] || [];

    let hqCostSum = 0;      // 總公司向供應商買
    let hqRevenueSum = 0;   // 總公司賣給分店（= 分店向總公司買）
    let hasUnknownIngredient = false;
    for (const b of ings) {
      const r = resolveBomRow(b);
      if (r.sourceLevel === "none" || r.qtyValue <= 0) {
        hasUnknownIngredient = true;
        continue;
      }
      hqCostSum += r.qtyValue * r.costPrice;
      hqRevenueSum += r.qtyValue * effectiveStorePrice(r.costPrice, r.storePrice, r.markupPct);
    }

    const sellPrice = Number(mi.sell_price) || 0;
    const hqCost = Math.round(hqCostSum * 100) / 100;
    const hqRevenue = Math.round(hqRevenueSum * 100) / 100;
    const storeCost = hqRevenue;

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
        const r = resolveBomRow(b);
        const sCost = effectiveStorePrice(r.costPrice, r.storePrice, r.markupPct);
        let displayCost = 0;
        if (userRole === "admin" || userRole === "buyer") {
          displayCost = r.costPrice;
        } else if (userRole === "manager") {
          displayCost = sCost;
        }
        return {
          id: b.id,
          ingredientId: b.ingredient_id,
          ingredientName: b.ingredient_name,
          quantity: b.quantity,
          quantityValue: b.quantity_value != null ? Number(b.quantity_value) : null,
          quantityUnit: b.quantity_unit,
          // 來源顯示：主家 / fallback / 無
          itemId: b.item_id,
          itemName: r.sourceItemName,
          itemUnit: r.sourceItemUnit,
          itemCost: displayCost,
          hqCost: showHq ? r.costPrice : 0,
          storeCost: showStore ? sCost : 0,
          /** 該 ingredient 有幾家供應商可選 */
          supplierCount: r.supplierCount,
          /** 用了哪一層：primary / fallback / none */
          priceSource: r.sourceLevel,
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
      // 新增 BOM 行：ingredient_id 是新的三層架構欄位；item_id 留作向下相容
      // 如果只給 ingredientId，後端會自動帶 ingredient.name 進 ingredient_name 欄位
      let ingredientName = ing.ingredientName;
      if (ing.ingredientId && !ingredientName) {
        const [ingRow] = await sql`SELECT name FROM ingredients WHERE id = ${ing.ingredientId}`;
        ingredientName = ingRow?.name ?? "";
      }
      await sql`
        INSERT INTO bom_items
          (menu_item_id, item_id, ingredient_id, ingredient_name, quantity, sort_order)
        VALUES
          (${menuItem.id}, ${ing.itemId || null}, ${ing.ingredientId || null},
           ${ingredientName}, ${ing.quantity}, ${i + 1})
      `;
    }
  }

  return NextResponse.json({ id: menuItem.id, message: "已新增" }, { status: 201 });
}
