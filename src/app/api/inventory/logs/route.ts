/**
 * GET /api/inventory/logs?item_id=xx — 查詢某品項的庫存異動紀錄
 */
import { NextRequest, NextResponse } from "next/server";
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";


export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id");

  let rows;
  if (itemId) {
    const parsedItemId = parseIntSafe(itemId);
    if (parsedItemId === null) {
      return NextResponse.json({ error: "無效的品項 ID" }, { status: 400 });
    }
    rows = await sql`
      SELECT l.*, i.name as item_name, st.name as store_name, u.name as user_name
      FROM inventory_logs l
      JOIN items i ON l.item_id = i.id
      LEFT JOIN stores st ON l.store_id = st.id
      LEFT JOIN users u ON l.created_by = u.id
      WHERE l.item_id = ${parsedItemId}
      ORDER BY l.created_at DESC
      LIMIT 100
    `;
  } else {
    rows = await sql`
      SELECT l.*, i.name as item_name, st.name as store_name, u.name as user_name
      FROM inventory_logs l
      JOIN items i ON l.item_id = i.id
      LEFT JOIN stores st ON l.store_id = st.id
      LEFT JOIN users u ON l.created_by = u.id
      ORDER BY l.created_at DESC
      LIMIT 100
    `;
  }

  return NextResponse.json(rows);
}
