/**
 * 供應商 API
 * GET /api/suppliers — 讀取供應商列表（含 paymentType）
 * POST /api/suppliers — 新增供應商（支援 paymentType）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq, sql, like } from "drizzle-orm";
import { authenticateRequest, requireAdmin } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";

/** 供應商分類 → 代碼前綴 */
const SUP_PREFIX: Record<string, string> = {
  '大陸': 'CN', '肉品': 'MT', '市場': 'MK', '海鮮': 'SF',
  '蔬菜': 'VG', '火鍋料': 'HP', '酒水': 'DK', '雜貨': 'GR', '耗材': 'MA',
};

/** 根據分類自動產生下一個供應商代碼 */
async function generateSupplierCode(category: string): Promise<string> {
  const prefix = SUP_PREFIX[category] || 'XX';
  const existing = await db
    .select({ code: suppliers.code })
    .from(suppliers)
    .where(like(suppliers.code, `${prefix}-%`));
  const maxNum = existing.reduce((max, s) => {
    const num = parseInt(s.code?.split('-')[1] || '0');
    return num > max ? num : max;
  }, 0);
  return `${prefix}-${String(maxNum + 1).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  const limit = limitParam ? parseIntSafe(limitParam) : null;
  const offset = offsetParam ? (parseIntSafe(offsetParam) ?? 0) : 0;

  // 取得供應商 + 各供應商的品項數量
  const allSuppliers = await db
    .select({
      id: suppliers.id,
      code: suppliers.code,
      name: suppliers.name,
      category: suppliers.category,
      contact: suppliers.contact,
      phone: suppliers.phone,
      notes: suppliers.notes,
      companyName: suppliers.companyName,
      taxId: suppliers.taxId,
      address: suppliers.address,
      noDeliveryDays: suppliers.noDeliveryDays,
      leadDays: suppliers.leadDays,
      deliveryDays: suppliers.deliveryDays,
      freeShippingMin: suppliers.freeShippingMin,
      paymentType: suppliers.paymentType,
      minOrderAmount: suppliers.minOrderAmount,
      isActive: suppliers.isActive,
      itemsCount: sql<number>`(SELECT COUNT(*) FROM items WHERE items.supplier_id = ${suppliers.id} AND items.is_active = true)`,
    })
    .from(suppliers)
    .where(eq(suppliers.isActive, true))
    .orderBy(suppliers.name);

  // 伺服器端篩選
  let filtered = allSuppliers;
  if (category) {
    filtered = filtered.filter((s) => s.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code?.toLowerCase().includes(q) ||
        s.contact?.toLowerCase().includes(q)
    );
  }

  // 分頁回傳（帶 limit 參數時）
  if (limit !== null && limit > 0) {
    const paginated = filtered.slice(offset, offset + limit);
    return NextResponse.json({
      data: paginated,
      meta: { total: filtered.length, limit, offset, hasMore: offset + limit < filtered.length },
    });
  }

  // 向下相容：不帶 limit 時回傳全部陣列
  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { name, category, contact, phone, notes, noDeliveryDays, leadDays, paymentType, companyName, taxId, address, deliveryDays, freeShippingMin, orderCutoff, minOrderAmount, orderDays } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "供應商名稱不能為空" }, { status: 400 });
  }

  const code = await generateSupplierCode(category || '其他');

  const [newSupplier] = await db
    .insert(suppliers)
    .values({
      name,
      code,
      category,
      companyName: companyName || null,
      taxId: taxId || null,
      address: address || null,
      contact: contact || null,
      phone: phone || null,
      notes: notes || null,
      noDeliveryDays: noDeliveryDays || [],
      leadDays: leadDays || 1,
      deliveryDays: deliveryDays || 1,
      freeShippingMin: freeShippingMin || 0,
      paymentType: paymentType || '月結',
      ...(orderCutoff !== undefined && { orderCutoff }),
      ...(minOrderAmount !== undefined && { minOrderAmount }),
      ...(orderDays !== undefined && { orderDays }),
    })
    .returning();

  return NextResponse.json(newSupplier, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { id, name, category, contact, phone, notes, noDeliveryDays, leadDays, paymentType, companyName, taxId, address, deliveryDays, freeShippingMin, orderCutoff, minOrderAmount, orderDays } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少供應商 ID" }, { status: 400 });
  }

  const [updated] = await db
    .update(suppliers)
    .set({
      ...(name && { name }),
      ...(category && { category }),
      companyName: companyName ?? null,
      taxId: taxId ?? null,
      address: address ?? null,
      contact: contact ?? null,
      phone: phone ?? null,
      notes: notes ?? null,
      ...(noDeliveryDays !== undefined && { noDeliveryDays }),
      ...(leadDays !== undefined && { leadDays }),
      ...(deliveryDays !== undefined && { deliveryDays }),
      ...(freeShippingMin !== undefined && { freeShippingMin }),
      ...(paymentType && { paymentType }),
      ...(orderCutoff !== undefined && { orderCutoff }),
      ...(minOrderAmount !== undefined && { minOrderAmount }),
      ...(orderDays !== undefined && { orderDays }),
    })
    .where(eq(suppliers.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "找不到供應商" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
