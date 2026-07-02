/**
 * GET /api/receiving/pending?storeId=N&days=7
 *
 * 回傳某門市「近 N 天所有還沒驗收」的訂單品項（跨多張訂單、跨多天）。
 *
 * 為什麼要這支：拆單一次會產生多張供應商訂單，舊的驗收頁只抓「當天最新一張」，
 * 其他張的貨到了沒畫面驗、隔天到貨更是完全看不到。這支把近幾天所有未驗收
 * 品項一次撈出來，按供應商分組，徹底解決漏單。
 *
 * 「未驗收」= 該 order_item 還沒有 receiving 紀錄。
 * 只看 draft/submitted/ordered/receiving/received 狀態的訂單（排除 cancelled/closed）。
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 30;

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const storeId = parseIntSafe(searchParams.get("storeId"));
  if (storeId === null) {
    return NextResponse.json({ error: "缺少或無效的 storeId" }, { status: 400 });
  }
  const rawDays = parseIntSafe(searchParams.get("days"));
  const days = Math.min(Math.max(1, rawDays ?? DEFAULT_DAYS), MAX_DAYS);

  // 近 N 天、該門市、還沒驗收的 order_items
  const rows = await sql`
    SELECT
      oi.id            AS order_item_id,
      o.id             AS order_id,
      o.order_date,
      o.status         AS order_status,
      i.name           AS item_name,
      oi.quantity,
      oi.unit,
      s.name           AS supplier_name,
      s.id             AS supplier_id
    FROM order_items oi
    JOIN orders o     ON oi.order_id = o.id
    JOIN items i      ON oi.item_id = i.id
    JOIN suppliers s  ON i.supplier_id = s.id
    LEFT JOIN receiving r ON r.order_item_id = oi.id
    WHERE oi.store_id = ${storeId}
      AND o.order_date >= (CURRENT_DATE - ${days}::int)
      AND o.status NOT IN ('cancelled', 'closed')
      AND r.id IS NULL
    ORDER BY o.order_date DESC, s.name, i.name
  `;

  const items = rows.map((r) => ({
    orderItemId: Number(r.order_item_id),
    orderId: Number(r.order_id),
    orderDate: String(r.order_date),
    orderStatus: String(r.order_status),
    itemName: String(r.item_name),
    quantity: String(r.quantity),
    unit: r.unit ? String(r.unit) : "",
    supplierName: String(r.supplier_name),
    supplierId: Number(r.supplier_id),
  }));

  return NextResponse.json({ items, days });
}
