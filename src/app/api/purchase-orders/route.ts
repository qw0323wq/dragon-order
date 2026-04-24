/**
 * 供應商叫貨單 API
 *
 * GET  /api/purchase-orders?date=2026-03-27  — 讀取某日的叫貨單
 * POST /api/purchase-orders                  — 從 order_items 產生叫貨單
 */
import { NextRequest, NextResponse } from "next/server";
import { db, rawSql } from "@/lib/db";
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
import { createLogger } from "@/lib/logger";
import { notifyPOGenerated } from "@/lib/line-notify";
import { roundMoney, sumBy } from "@/lib/format";

const log = createLogger("purchase-orders");

/** GET — 讀取叫貨單列表（支援 date/status 篩選） */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const date = request.nextUrl.searchParams.get("date");

  try {
    // 查叫貨單（用 order_date 篩選）
    const pos = date
      ? await rawSql`
          SELECT po.id, po.po_number, po.supplier_id, po.order_date, po.delivery_date,
                 po.status, po.total_amount, po.notes, po.created_at,
                 s.name as supplier_name, s.category as supplier_category
          FROM purchase_orders po
          JOIN suppliers s ON po.supplier_id = s.id
          WHERE po.order_date = ${date}
          ORDER BY s.category, s.name
        `
      : await rawSql`
          SELECT po.id, po.po_number, po.supplier_id, po.order_date, po.delivery_date,
                 po.status, po.total_amount, po.notes, po.created_at,
                 s.name as supplier_name, s.category as supplier_category
          FROM purchase_orders po
          JOIN suppliers s ON po.supplier_id = s.id
          ORDER BY po.order_date DESC, s.name
          LIMIT 50
        `;

    if (pos.length === 0) {
      return NextResponse.json({ purchaseOrders: [], date });
    }

    // 一次查出所有叫貨單明細（避免 N+1）
    const poIds = pos.map((po) => po.id);
    const allPoItems = poIds.length > 0
      ? await rawSql`
          SELECT poi.id, poi.po_id, poi.item_id, poi.store_id, poi.quantity, poi.unit,
                 poi.unit_price, poi.subtotal, poi.notes,
                 i.name as item_name, i.category as item_category, i.unit as item_unit,
                 i.spec as item_spec, i.cost_price,
                 st.name as store_name
          FROM purchase_order_items poi
          JOIN items i ON poi.item_id = i.id
          JOIN stores st ON poi.store_id = st.id
          WHERE poi.po_id = ANY(${poIds})
          ORDER BY i.category, i.name, st.name
        `
      : ([] as Record<string, unknown>[]);

    // 按 po_id 分組
    const itemsByPo = new Map<number, Record<string, unknown>[]>();
    for (const pi of allPoItems) {
      const pid = pi.po_id as number;
      const list = itemsByPo.get(pid) ?? [];
      list.push(pi);
      itemsByPo.set(pid, list);
    }

    const result = pos.map((po) => ({
      ...po,
      poNumber: po.po_number,
      supplierId: po.supplier_id,
      supplierName: po.supplier_name,
      supplierCategory: po.supplier_category,
      deliveryDate: po.delivery_date || po.order_date,
      totalAmount: po.total_amount,
      items: (itemsByPo.get(po.id as number) ?? []).map(pi => ({
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
    }));

    return NextResponse.json({ purchaseOrders: result, date });
  } catch (err) {
    log.error({ err, date }, "PO GET error");
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

  try {
    // 1. 讀取該日所有訂單品項（draft 也算，排除 cancelled）
    const rawItems = await rawSql`
      SELECT oi.item_id, oi.store_id, oi.quantity, oi.unit, oi.unit_price, oi.notes,
             i.supplier_id, i.supplier_notes, i.cost_price
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
      WHERE o.order_date = ${date}
        AND o.status != 'cancelled'
    `;

    if (rawItems.length === 0) {
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

    // CRITICAL: 整個 PO 生成包在 transaction 裡
    // 原 bug：DELETE 舊明細後 INSERT 失敗會 orphan（PO 存在但沒明細）
    // 修：transaction 讓 DELETE + INSERT 原子，失敗整批 rollback
    const createdPOs = await rawSql.begin(async (_tx) => {
      const tx = _tx as unknown as typeof rawSql;

      // 3. 產生 PO 編號（tx 內）
      const dateStr = date.replace(/-/g, "");
      const [{ count: existingCount }] = await tx`
        SELECT COUNT(*)::int as count FROM purchase_orders WHERE order_date = ${date}
      `;
      let poIndex = (existingCount as number) + 1;

      const created: { id: number; poNumber: string }[] = [];

      for (const [supplierId, supplierItems] of bySupplier) {
        // 鎖定該供應商當日 PO 紀錄（若已存在），避併發重複 INSERT
        const [existing] = await tx`
          SELECT id FROM purchase_orders
          WHERE supplier_id = ${supplierId} AND order_date = ${date} AND status != 'cancelled'
          FOR UPDATE
        `;

        let poId: number;
        let poNumber: string;

        // 計算 total_amount（保留 2 位小數）
        const totalAmount = roundMoney(
          sumBy(supplierItems, (si) => {
            const qty = parseFloat(si.quantity as string) || 0;
            const price = (si.cost_price as number) || 0;
            return qty * price;
          })
        );

        if (existing) {
          // 重新產生：先刪舊明細（CASCADE 不觸發，因為 PO 保留），再插新的
          poId = existing.id as number;
          poNumber = `PO-${dateStr}-existing`;
          await tx`DELETE FROM purchase_order_items WHERE po_id = ${poId}`;
          await tx`UPDATE purchase_orders SET total_amount = ${totalAmount} WHERE id = ${poId}`;
        } else {
          poNumber = `PO-${dateStr}-${String(poIndex).padStart(3, "0")}`;
          poIndex++;

          const [newPO] = await tx`
            INSERT INTO purchase_orders (po_number, supplier_id, order_date, delivery_date, total_amount, status, created_by)
            VALUES (${poNumber}, ${supplierId}, ${date}, ${date}, ${totalAmount}, 'draft', ${auth.userId ?? null})
            RETURNING id
          `;
          poId = newPO.id as number;
        }

        // 5. 插入明細（subtotal 保留 2 位小數）
        for (const si of supplierItems) {
          const qty = parseFloat(si.quantity as string) || 0;
          const price = (si.cost_price as number) || 0;
          await tx`
            INSERT INTO purchase_order_items (po_id, item_id, store_id, quantity, unit, unit_price, subtotal, notes)
            VALUES (${poId}, ${si.item_id}, ${si.store_id}, ${si.quantity}, ${si.unit}, ${price}, ${roundMoney(qty * price)}, ${si.notes || si.supplier_notes || null})
          `;
        }

        created.push({ id: poId, poNumber });
      }

      return created;
    });

    // LINE 通知（非阻塞，在 transaction 外）
    notifyPOGenerated({
      date,
      supplierCount: bySupplier.size,
      poNumbers: createdPOs.map((po) => po.poNumber),
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      date,
      supplierCount: bySupplier.size,
      purchaseOrders: createdPOs,
      message: `已產生 ${bySupplier.size} 張叫貨單`,
    });
  } catch (err) {
    log.error({ err, date }, "PO generation error");
    return NextResponse.json({ error: "產生叫貨單失敗，已自動回滾" }, { status: 500 });
  }
}
