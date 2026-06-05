/**
 * 採購需求 API（staging — 員工提需求，老闆未處理前的草稿）
 *
 * GET  /api/purchase-requests?status=pending|processed|cancelled&storeId=N
 *      → 列表（admin/buyer 看全部；manager/staff 只看自己門市）
 *
 * POST /api/purchase-requests
 *      Body: { storeId, items: [{ ingredientId, currentStock, neededQty, unit?, notes? }], notes? }
 *      → 提需求；自動推薦每個 ingredient 的主供應商 SKU 到 suggested_item_id
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest, getStoreScope } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

// ─────────────────────────────────────────────
// GET — 列表
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status"); // pending / processed / cancelled
  const storeIdRaw = searchParams.get("storeId");
  const storeId = storeIdRaw ? parseIntSafe(storeIdRaw) : null;
  if (storeIdRaw && storeId === null) {
    return NextResponse.json({ error: "無效的 storeId" }, { status: 400 });
  }

  // manager/staff 只能看自己門市
  const scope = getStoreScope(request, auth);
  const effectiveStoreId = scope ?? storeId;

  const rows = await sql`
    SELECT
      pr.id, pr.store_id, pr.request_date, pr.status, pr.created_by,
      pr.processed_by, pr.processed_at, pr.order_ids, pr.notes, pr.created_at,
      s.name as store_name,
      u.name as creator_name,
      (SELECT COUNT(*)::int FROM purchase_request_items WHERE request_id = pr.id) as item_count
    FROM purchase_requests pr
    JOIN stores s ON pr.store_id = s.id
    LEFT JOIN users u ON pr.created_by = u.id
    WHERE 1=1
      ${status ? sql`AND pr.status = ${status}` : sql``}
      ${effectiveStoreId !== null ? sql`AND pr.store_id = ${effectiveStoreId}` : sql``}
    ORDER BY pr.request_date DESC, pr.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json(rows);
}

// ─────────────────────────────────────────────
// POST — 員工提需求
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const userId = auth.userId ?? null;
  const body = await request.json();
  const { storeId, items, notes } = body as {
    storeId: number;
    items: Array<{
      ingredientId: number;
      currentStock?: number;
      neededQty: number;
      unit?: string;
      notes?: string;
    }>;
    notes?: string;
  };

  if (!storeId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "缺少 storeId 或 items" }, { status: 400 });
  }

  // 包 transaction：建 request 主表 + 寫明細（含自動推薦主家）
  try {
    const result = await sql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof sql;

      // 1. 建主表
      const [req] = (await tx`
        INSERT INTO purchase_requests (store_id, created_by, notes)
        VALUES (${storeId}, ${userId}, ${notes || null})
        RETURNING id
      `) as unknown as Array<{ id: number }>;

      // 2. 寫明細（每筆順便推薦主家）
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.ingredientId || !it.neededQty) continue;

        // 取 ingredient name + 推薦主家 SKU
        const [ing] = (await tx`
          SELECT name, unit FROM ingredients WHERE id = ${it.ingredientId}
        `) as unknown as Array<{ name: string; unit: string }>;
        if (!ing) continue;

        const [primary] = (await tx`
          SELECT id FROM items
          WHERE ingredient_id = ${it.ingredientId} AND is_primary = true AND is_active = true
          LIMIT 1
        `) as unknown as Array<{ id: number }>;
        const suggestedItemId = primary?.id ?? null;

        await tx`
          INSERT INTO purchase_request_items
            (request_id, ingredient_id, ingredient_name, current_stock, needed_qty,
             unit, suggested_item_id, chosen_item_id, notes, sort_order)
          VALUES
            (${req.id}, ${it.ingredientId}, ${ing.name},
             ${it.currentStock ?? null}, ${it.neededQty}, ${it.unit || ing.unit},
             ${suggestedItemId}, ${suggestedItemId}, ${it.notes || null}, ${i})
        `;
      }

      return req.id;
    });

    return NextResponse.json({ success: true, id: result }, { status: 201 });
  } catch (err) {
    console.error("[purchase-requests POST] error:", err);
    const msg = err instanceof Error ? err.message : "建立需求失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
