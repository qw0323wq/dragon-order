/**
 * 訂單總覽 API（列表模式用）
 * GET /api/orders/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 回傳日期範圍內每張訂單 + 聚合統計（品項數/供應商數/驗收進度/付款進度），
 * 供訂單列表頁的狀態 pills 與首頁待辦卡使用。
 * 衍生狀態（待驗收/待付款/已完成）由前端從這些欄位計算，見
 * src/app/dashboard/orders/_components/types.ts 的 deriveWorkflowStatus()。
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql } from "@/lib/db";
import { authenticateRequest, getStoreScope } from "@/lib/api-auth";
import { formatDateLocal } from "@/lib/format";

/** 查詢範圍上限（天）— 防止一次撈整個資料庫 */
const MAX_RANGE_DAYS = 92;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface OrderOverviewRow {
  id: number;
  orderDate: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  supplierCount: number;
  receivedCount: number;
  paidSupplierCount: number;
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const storeScope = getStoreScope(request, auth);
  const { searchParams } = new URL(request.url);

  const today = formatDateLocal();
  const to = searchParams.get("to") ?? today;
  const from = searchParams.get("from") ?? addDaysStr(today, -29);

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "日期格式須為 YYYY-MM-DD" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from 不可晚於 to" }, { status: 400 });
  }
  const rangeDays =
    (new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime()) / 86400000;
  if (rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `查詢範圍最多 ${MAX_RANGE_DAYS} 天` }, { status: 400 });
  }

  // 聚合說明：
  // - itemCount / supplierCount：明細數與涉及的供應商數（供應商掛在 items 上）
  // - receivedCount：已有驗收紀錄的明細數（COUNT DISTINCT 防 receiving 重複列）
  // - paidSupplierCount：payments 表中該訂單已標記 paid 的供應商數
  // - manager/staff 帶 storeScope：只列包含自己門市明細的訂單（與 GET /api/orders 同規則）
  const rows = await rawSql`
    SELECT
      o.id,
      o.order_date AS "orderDate",
      o.status,
      o.total_amount::float AS "totalAmount",
      COUNT(DISTINCT oi.id)::int AS "itemCount",
      COUNT(DISTINCT i.supplier_id)::int AS "supplierCount",
      COUNT(DISTINCT r.order_item_id)::int AS "receivedCount",
      COALESCE(p.paid_count, 0)::int AS "paidSupplierCount"
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN items i ON i.id = oi.item_id
    LEFT JOIN receiving r ON r.order_item_id = oi.id
    LEFT JOIN (
      SELECT order_id,
             COUNT(DISTINCT supplier_id) FILTER (WHERE status = 'paid')::int AS paid_count
      FROM payments
      GROUP BY order_id
    ) p ON p.order_id = o.id
    WHERE o.order_date >= ${from} AND o.order_date <= ${to}
    ${storeScope ? rawSql`AND EXISTS (
      SELECT 1 FROM order_items s WHERE s.order_id = o.id AND s.store_id = ${storeScope}
    )` : rawSql``}
    GROUP BY o.id, p.paid_count
    ORDER BY o.order_date DESC, o.created_at DESC
  `;

  return NextResponse.json({ from, to, orders: rows });
}
