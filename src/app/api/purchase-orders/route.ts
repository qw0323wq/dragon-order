/**
 * 供應商叫貨單 API
 *
 * GET  /api/purchase-orders?date=2026-03-27  — 讀取某日的叫貨單
 * POST /api/purchase-orders                  — 從 order_items 產生叫貨單
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  purchaseOrders,
  purchaseOrderItems,
  orderItems,
  orders,
  items,
  suppliers,
  stores,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";

/** GET — 讀取叫貨單列表（支援 date/status 篩選） */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date");

  const pgSql = (await import("postgres")).default(process.env.DATABASE_URL!, { prepare: false });

  try {
    // 查叫貨單（用 order_date 篩選）
    const pos = date
      ? await pgSql`
          SELECT po.id, po.po_number, po.supplier_id, po.order_date, po.delivery_date,
                 po.status, po.total_amount, po.notes, po.created_at,
                 s.name as supplier_name, s.category as supplier_category
          FROM purchase_orders po
          JOIN suppliers s ON po.supplier_id = s.id
          WHERE po.order_date = ${date}
          ORDER BY s.category, s.name
        `
      : await pgSql`
          SELECT po.id, po.po_number, po.supplier_id, po.order_date, po.delivery_date,
                 po.status, po.total_amount, po.notes, po.created_at,
                 s.name as supplier_name, s.category as supplier_category
          FROM purchase_orders po
          JOIN suppliers s ON po.supplier_id = s.id
          ORDER BY po.order_date DESC, s.name
          LIMIT 50
        `;

    if (pos.length === 0) {
      await pgSql.end();
      return NextResponse.json({ purchaseOrders: [], date });
    }

    // 查每張叫貨單的明細
    const result = await Promise.all(
      pos.map(async (po) => {
        const poItems = await pgSql`
          SELECT poi.id, poi.item_id, poi.store_id, poi.quantity, poi.unit,
                 poi.unit_price, poi.subtotal, poi.notes,
                 i.name as item_name, i.category as item_category, i.unit as item_unit,
                 i.spec as item_spec, i.cost_price,
                 st.name as store_name
          FROM purchase_order_items poi
          JOIN items i ON poi.item_id = i.id
          JOIN stores st ON poi.store_id = st.id
          WHERE poi.po_id = ${po.id}
          ORDER BY i.category, i.name, st.name
        `;
        return {
          ...po,
          poNumber: po.po_number,
          supplierId: po.supplier_id,
          supplierName: po.supplier_name,
          supplierCategory: po.supplier_category,
          deliveryDate: po.delivery_date || po.order_date,
          totalAmount: po.total_amount,
          items: poItems.map(pi => ({
            ...pi,
            itemId: pi.item_id,
            itemName: pi.item_name,
            itemCategory: pi.item_category,
            itemUnit: pi.item_unit,
            itemSpec: pi.item_spec,
            storeId: pi.store_id,
            storeName: pi.store_name,
            unitPrice: pi.unit_price,
            costPrice: pi.cost_price,
          })),
        };
      })
    );

    await pgSql.end();
    return NextResponse.json({ purchaseOrders: result, date });
  } catch (err) {
    await pgSql.end();
    console.error("PO GET error:", err);
    return NextResponse.json({ purchaseOrders: [], date, error: "查詢失敗" });
  }
}

/**
 * POST — 從當日 order_items 自動產生叫貨單
 * Body: { date: "2026-03-27" }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { date } = body as { date: string };

  if (!date) {
    return NextResponse.json({ error: "請提供 date" }, { status: 400 });
  }

  // 用 raw SQL 避免 Drizzle template 問題
  const pgSql = (await import("postgres")).default(process.env.DATABASE_URL!, { prepare: false });

  try {
    // 1. 讀取該日所有訂單品項（draft 也算，排除 cancelled）
    const rawItems = await pgSql`
      SELECT oi.item_id, oi.store_id, oi.quantity, oi.unit, oi.unit_price, oi.notes,
             i.supplier_id, i.supplier_notes, i.cost_price
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
      WHERE o.order_date = ${date}
        AND o.status != 'cancelled'
    `;

    if (rawItems.length === 0) {
      await pgSql.end();
      return NextResponse.json(
        { error: `${date} 沒有訂單品項（請先從叫貨頁送出訂單）` },
        { status: 404 }
      );
    }

    // 2. 按供應商分組
    type RawItem = (typeof rawItems)[number];
    const bySupplier = new Map<number, RawItem[]>();
    for (const item of rawItems) {
      const sid = item.supplier_id as number;
      const list = bySupplier.get(sid) ?? [];
      list.push(item);
      bySupplier.set(sid, list);
    }

    // 3. 產生 PO 編號
    const dateStr = date.replace(/-/g, "");
    const [{ count: existingCount }] = await pgSql`
      SELECT COUNT(*)::int as count FROM purchase_orders WHERE order_date = ${date}
    `;
    let poIndex = (existingCount as number) + 1;

    // 4. 為每個供應商建立叫貨單
    const createdPOs: { id: number; poNumber: string }[] = [];

    for (const [supplierId, supplierItems] of bySupplier) {
      // 檢查是否已存在
      const [existing] = await pgSql`
        SELECT id FROM purchase_orders
        WHERE supplier_id = ${supplierId} AND order_date = ${date} AND status != 'cancelled'
        LIMIT 1
      `;

      let poId: number;
      let poNumber: string;

      if (existing) {
        poId = existing.id as number;
        poNumber = `PO-${dateStr}-existing`;
        await pgSql`DELETE FROM purchase_order_items WHERE po_id = ${poId}`;
      } else {
        poNumber = `PO-${dateStr}-${String(poIndex).padStart(3, "0")}`;
        poIndex++;

        const totalAmount = supplierItems.reduce((sum, si) => {
          const qty = parseFloat(si.quantity as string) || 0;
          const price = (si.cost_price as number) || 0;
          return sum + Math.round(qty * price);
        }, 0);

        const [newPO] = await pgSql`
          INSERT INTO purchase_orders (po_number, supplier_id, order_date, delivery_date, total_amount, status, created_by)
          VALUES (${poNumber}, ${supplierId}, ${date}, ${date}, ${totalAmount}, 'draft', ${auth.userId ?? null})
          RETURNING id
        `;
        poId = newPO.id as number;
      }

      // 5. 插入明細
      for (const si of supplierItems) {
        const qty = parseFloat(si.quantity as string) || 0;
        const price = (si.cost_price as number) || 0;
        await pgSql`
          INSERT INTO purchase_order_items (po_id, item_id, store_id, quantity, unit, unit_price, subtotal, notes)
          VALUES (${poId}, ${si.item_id}, ${si.store_id}, ${si.quantity}, ${si.unit}, ${price}, ${Math.round(qty * price)}, ${si.notes || si.supplier_notes || null})
        `;
      }

      createdPOs.push({ id: poId, poNumber });
    }

    await pgSql.end();

    return NextResponse.json({
      ok: true,
      date,
      supplierCount: bySupplier.size,
      purchaseOrders: createdPOs,
      message: `已產生 ${bySupplier.size} 張叫貨單`,
    });
  } catch (err) {
    await pgSql.end();
    console.error("PO generation error:", err);
    return NextResponse.json({ error: "產生叫貨單失敗" }, { status: 500 });
  }
}
