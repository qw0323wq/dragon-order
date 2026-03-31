/**
 * 單一叫貨單 API
 * GET    /api/purchase-orders/[id]          — 讀取明細
 * PATCH  /api/purchase-orders/[id]          — 更新狀態/備註
 * GET    /api/purchase-orders/[id]?export=1 — 匯出文字格式（無價格）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  purchaseOrders,
  purchaseOrderItems,
  items,
  stores,
  suppliers,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const poId = parseInt(id);

  // 讀取叫貨單基本資訊
  const [po] = await db
    .select({
      id: purchaseOrders.id,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      poNumber: purchaseOrders.poNumber,
      deliveryDate: purchaseOrders.deliveryDate,
      totalAmount: purchaseOrders.totalAmount,
      status: purchaseOrders.status,
      notes: purchaseOrders.notes,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.id, poId))
    .limit(1);

  if (!po) {
    return NextResponse.json({ error: "叫貨單不存在" }, { status: 404 });
  }

  // 讀取明細
  const poItems = await db
    .select({
      id: purchaseOrderItems.id,
      itemId: purchaseOrderItems.itemId,
      itemName: items.name,
      itemUnit: items.unit,
      itemSpec: items.spec,
      storeId: purchaseOrderItems.storeId,
      storeName: stores.name,
      quantity: purchaseOrderItems.quantity,
      unit: purchaseOrderItems.unit,
      unitPrice: purchaseOrderItems.unitPrice,
      subtotal: purchaseOrderItems.subtotal,
      notes: purchaseOrderItems.notes,
    })
    .from(purchaseOrderItems)
    .innerJoin(items, eq(purchaseOrderItems.itemId, items.id))
    .innerJoin(stores, eq(purchaseOrderItems.storeId, stores.id))
    .where(eq(purchaseOrderItems.poId, poId))
    .orderBy(items.name, stores.name);

  // 匯出模式：產生文字格式（給供應商看，無價格）
  const isExport = request.nextUrl.searchParams.get("export") === "1";
  if (isExport) {
    const text = generateExportText(po, poItems);
    return new NextResponse(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({ ...po, items: poItems });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const poId = parseInt(id);
  const body = await request.json();
  const { status, notes } = body as { status?: string; notes?: string };

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });
  }

  await db
    .update(purchaseOrders)
    .set(updates)
    .where(eq(purchaseOrders.id, poId));

  return NextResponse.json({ ok: true });
}

/** 產生匯出文字（無價格，含各店明細 + 備註） */
function generateExportText(
  po: { supplierName: string; poNumber: string; deliveryDate: string },
  poItems: {
    itemName: string;
    storeName: string;
    quantity: string;
    unit: string | null;
    notes: string | null;
    itemUnit: string;
    itemSpec: string | null;
  }[]
) {
  const storeNames = [...new Set(poItems.map((i) => i.storeName))].sort();

  // 按品項分組，每個品項列出各店數量 + 備註
  const itemMap = new Map<
    string,
    { notes: string | null; stores: Map<string, number>; unit: string }
  >();
  for (const pi of poItems) {
    const key = pi.itemName;
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        notes: pi.notes || pi.itemSpec,
        stores: new Map(),
        unit: pi.unit || pi.itemUnit,
      });
    }
    const entry = itemMap.get(key)!;
    const qty = parseFloat(pi.quantity) || 0;
    entry.stores.set(pi.storeName, (entry.stores.get(pi.storeName) || 0) + qty);
  }

  const lines: string[] = [];
  lines.push(`肥龍老火鍋叫貨單`);
  lines.push(`供應商：${po.supplierName}`);
  lines.push(`配送日期：${po.deliveryDate}`);
  lines.push(`單號：${po.poNumber}`);
  lines.push("");

  // Header
  const header = ["品名", ...storeNames, "合計", "單位", "備註"];
  lines.push(header.join("\t"));

  // Items
  for (const [name, entry] of itemMap) {
    const row: string[] = [name];
    let total = 0;
    for (const store of storeNames) {
      const qty = entry.stores.get(store) || 0;
      row.push(qty > 0 ? String(qty) : "");
      total += qty;
    }
    row.push(String(total));
    row.push(entry.unit);
    row.push(entry.notes || "");
    lines.push(row.join("\t"));
  }

  return lines.join("\n");
}
