/**
 * POST /api/sales/consume — 銷售消耗扣 ingredient 庫存
 *
 * Body：
 *   {
 *     storeId: number,             // 哪間門市銷售
 *     source?: string,             // 來源描述（如「POS 5/14」）
 *     items: Array<{
 *       menuItemId?: number,       // 賣的菜（會展開 BOM 算消耗）
 *       ingredientId?: number,     // 或直接指定消耗 ingredient
 *       quantity: number,          // 銷售份數（搭配 menuItemId）或 ingredient 用量（搭配 ingredientId）
 *       unit?: string,
 *     }>
 *   }
 *
 * 扣減策略（主家優先 + FIFO）：
 *   1. 對每個要消耗的 ingredient，找該 ingredient 的所有 active SKU 在指定 store 的庫存
 *   2. 排序：is_primary DESC, current_stock DESC, id ASC（主家優先、滿的先扣）
 *   3. 從第一個 SKU 扣，扣完才換下一個
 *   4. 全部扣完還不夠 → 記 shortfall 但不擋（庫存允許負）
 *   5. 寫 inventory_logs 留軌跡
 *
 * 整個操作包 transaction，失敗整批 rollback。
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { requireManagerOrAbove } from "@/lib/api-auth";

interface ConsumeItem {
  menuItemId?: number;
  ingredientId?: number;
  quantity: number;
  unit?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireManagerOrAbove(request);
  if (!auth.ok) return auth.response;
  const userId = auth.userId ?? null;

  const body = await request.json();
  const { storeId, source, items } = body as {
    storeId: number;
    source?: string;
    items: ConsumeItem[];
  };

  if (!storeId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "缺少 storeId 或 items" }, { status: 400 });
  }

  const sourceLabel = source || "POS 銷售";

  try {
    const result = await sql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof sql;

      // Step 1: 展開 BOM，把 menuItemId 轉成 ingredient 消耗清單
      // ingredientNeeds: Map<ingredientId, totalConsumeQty>
      const ingredientNeeds = new Map<number, { qty: number; menuLabels: string[] }>();

      for (const ci of items) {
        if (ci.ingredientId) {
          // 直接消耗 ingredient
          const prev = ingredientNeeds.get(ci.ingredientId);
          ingredientNeeds.set(ci.ingredientId, {
            qty: (prev?.qty ?? 0) + ci.quantity,
            menuLabels: prev?.menuLabels ?? [],
          });
          continue;
        }

        if (!ci.menuItemId) continue;

        // 展開 BOM
        const bomRows = (await tx`
          SELECT bi.ingredient_id, bi.ingredient_name, bi.quantity_value, bi.quantity
          FROM bom_items bi
          WHERE bi.menu_item_id = ${ci.menuItemId} AND bi.ingredient_id IS NOT NULL
        `) as unknown as Array<{
          ingredient_id: number;
          ingredient_name: string;
          quantity_value: string | null;
          quantity: string;
        }>;

        const [menu] = (await tx`SELECT name FROM menu_items WHERE id = ${ci.menuItemId}`) as unknown as Array<{ name: string }>;
        const menuLabel = `${menu?.name ?? `menu#${ci.menuItemId}`}×${ci.quantity}`;

        for (const b of bomRows) {
          // 每份用量
          let perServing = 0;
          if (b.quantity_value != null) perServing = Number(b.quantity_value);
          if (!perServing || isNaN(perServing)) perServing = parseFloat(b.quantity) || 0;
          if (perServing <= 0) continue;

          const need = perServing * ci.quantity;
          const prev = ingredientNeeds.get(b.ingredient_id);
          ingredientNeeds.set(b.ingredient_id, {
            qty: (prev?.qty ?? 0) + need,
            menuLabels: [...(prev?.menuLabels ?? []), menuLabel],
          });
        }
      }

      // Step 2: 對每個 ingredient 消耗，按主家優先扣 store_inventory
      const deducted: Array<{
        ingredientId: number;
        ingredientName: string;
        needed: number;
        deducted: number;
        shortfall: number;
        skuBreakdown: Array<{ itemId: number; itemName: string; deducted: number; remaining: number }>;
      }> = [];

      for (const [ingredientId, { qty: needed }] of ingredientNeeds.entries()) {
        // 取該 ingredient 在指定 store 的所有 SKU 庫存（鎖行避免併發）
        const skuRows = (await tx`
          SELECT i.id as item_id, i.name as item_name, i.is_primary, i.unit,
                 si.current_stock::numeric as current_stock
          FROM items i
          JOIN store_inventory si ON si.item_id = i.id AND si.store_id = ${storeId}
          WHERE i.ingredient_id = ${ingredientId} AND i.is_active = true
          ORDER BY i.is_primary DESC, si.current_stock DESC, i.id ASC
          FOR UPDATE
        `) as unknown as Array<{ item_id: number; item_name: string; is_primary: boolean; unit: string; current_stock: string }>;

        const [ingRow] = (await tx`SELECT name FROM ingredients WHERE id = ${ingredientId}`) as unknown as Array<{ name: string }>;
        const ingredientName = ingRow?.name ?? `ing#${ingredientId}`;

        let remaining = needed;
        const breakdown: typeof deducted[number]["skuBreakdown"] = [];

        for (const sku of skuRows) {
          if (remaining <= 0) break;
          const stock = Number(sku.current_stock);
          if (stock <= 0) continue;
          const take = Math.min(stock, remaining);
          const newStock = stock - take;

          await tx`
            UPDATE store_inventory
            SET current_stock = ${newStock}, updated_at = NOW()
            WHERE item_id = ${sku.item_id} AND store_id = ${storeId}
          `;

          // 寫 log
          await tx`
            INSERT INTO inventory_logs
              (item_id, type, quantity, unit, balance_after, store_id, source, created_by)
            VALUES
              (${sku.item_id}, 'out', ${-take}, ${sku.unit ?? null}, ${newStock},
               ${storeId}, ${sourceLabel + " - " + ingredientName}, ${userId})
          `;

          breakdown.push({
            itemId: sku.item_id,
            itemName: sku.item_name,
            deducted: take,
            remaining: newStock,
          });
          remaining -= take;
        }

        // 同步 items.current_stock = SUM across stores
        for (const b of breakdown) {
          const [{ total }] = (await tx`
            SELECT COALESCE(SUM(current_stock::numeric), 0) as total
            FROM store_inventory WHERE item_id = ${b.itemId}
          `) as unknown as Array<{ total: string }>;
          await tx`UPDATE items SET current_stock = ${total} WHERE id = ${b.itemId}`;
        }

        deducted.push({
          ingredientId,
          ingredientName,
          needed,
          deducted: needed - remaining,
          shortfall: remaining,
          skuBreakdown: breakdown,
        });
      }

      return deducted;
    });

    return NextResponse.json({
      success: true,
      consumed: result.length,
      results: result,
    });
  } catch (err) {
    console.error("[sales/consume] error:", err);
    const msg = err instanceof Error ? err.message : "消耗失敗，已自動回滾";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
