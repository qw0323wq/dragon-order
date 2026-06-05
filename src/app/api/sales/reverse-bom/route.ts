/**
 * POST /api/sales/reverse-bom
 *
 * 給定菜品銷量 → 反推食材需求量
 *
 * Body: {
 *   items: Array<{ menuItemId: number; quantity: number }>
 * }
 *
 * 回傳：{ ingredients: [{ ingredientId, name, unit, totalNeeded, breakdown: [...] }] }
 *   - totalNeeded：所有菜品累積的食材需求
 *   - breakdown：哪些菜品×多少份貢獻了多少需求（debug 用）
 *
 * 用途：員工側「賣了 100 份貢丸湯」→ 反推「需要叫 100×用量 的貢丸」
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

interface ReverseInput {
  menuItemId: number;
  quantity: number;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const inputs = body.items as ReverseInput[];
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return NextResponse.json({ error: "缺少 items 陣列" }, { status: 400 });
  }

  // 拉所有相關 menu_item 的 BOM 行（含 ingredient + 拆好的 quantity_value）
  const menuItemIds = [...new Set(inputs.map((x) => x.menuItemId))];

  const bomRows = (await sql`
    SELECT bi.menu_item_id, bi.ingredient_id, bi.ingredient_name,
           bi.quantity, bi.quantity_value, bi.quantity_unit,
           ing.name as ingredient_canonical_name, ing.unit as ingredient_unit,
           mi.name as menu_name
    FROM bom_items bi
    JOIN menu_items mi ON bi.menu_item_id = mi.id
    LEFT JOIN ingredients ing ON bi.ingredient_id = ing.id
    WHERE bi.menu_item_id = ANY(${menuItemIds}) AND bi.ingredient_id IS NOT NULL
  `) as unknown as Array<{
    menu_item_id: number;
    ingredient_id: number;
    ingredient_name: string;
    ingredient_canonical_name: string | null;
    ingredient_unit: string | null;
    quantity: string;
    quantity_value: string | null;
    quantity_unit: string | null;
    menu_name: string;
  }>;

  // 反推：對每個 input 銷量 × 對應 BOM 的 perServing 用量
  type AggrEntry = {
    ingredientId: number;
    name: string;
    unit: string;
    totalNeeded: number;
    breakdown: Array<{
      menuItemId: number;
      menuName: string;
      sales: number;
      perServing: number;
      contribution: number;
    }>;
  };
  const aggr = new Map<number, AggrEntry>();
  const unmatched: ReverseInput[] = [];

  for (const inp of inputs) {
    const boms = bomRows.filter((b) => b.menu_item_id === inp.menuItemId);
    if (boms.length === 0) {
      unmatched.push(inp);
      continue;
    }
    for (const b of boms) {
      let perServing = 0;
      if (b.quantity_value != null) perServing = Number(b.quantity_value);
      if (!perServing || isNaN(perServing)) perServing = parseFloat(b.quantity) || 0;
      if (perServing <= 0) continue;

      const contribution = perServing * inp.quantity;
      const cur = aggr.get(b.ingredient_id);
      const entry: AggrEntry = cur ?? {
        ingredientId: b.ingredient_id,
        name: b.ingredient_canonical_name ?? b.ingredient_name,
        unit: b.ingredient_unit ?? b.quantity_unit ?? "",
        totalNeeded: 0,
        breakdown: [],
      };
      entry.totalNeeded += contribution;
      entry.breakdown.push({
        menuItemId: b.menu_item_id,
        menuName: b.menu_name,
        sales: inp.quantity,
        perServing,
        contribution,
      });
      aggr.set(b.ingredient_id, entry);
    }
  }

  return NextResponse.json({
    ingredients: Array.from(aggr.values()).map((e) => ({
      ...e,
      totalNeeded: Math.ceil(e.totalNeeded * 100) / 100, // 保留 2 位小數
    })),
    unmatched, // 沒對到 BOM 的 menuItemId
  });
}
