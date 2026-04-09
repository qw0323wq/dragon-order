/**
 * 品項 API — 依角色回傳不同價格
 *
 * admin/buyer：看到進貨價（costPrice）+ 店家採購價（storePrice）+ 售價
 * manager：看到店家採購價（當作他的成本）+ 售價
 * staff：看不到任何價格
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest } from "@/lib/api-auth";
import { verifySession } from "@/lib/session";
import { getEffectiveStorePrice } from "@/lib/permissions";
import { parseIntSafe } from "@/lib/parse-int-safe";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  // 分頁參數（向下相容：不帶 limit 時回傳全部）
  const limit = limitParam ? parseIntSafe(limitParam) : null;
  const offset = offsetParam ? (parseIntSafe(offsetParam) ?? 0) : 0;

  const allItems = await db
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      category: items.category,
      unit: items.unit,
      costPrice: items.costPrice,
      storePrice: items.storePrice,
      sellPrice: items.sellPrice,
      spec: items.spec,
      supplierNotes: items.supplierNotes,
      aliases: items.aliases,
      supplierId: items.supplierId,
      supplierName: suppliers.name,
      minOrderQty: items.minOrderQty,
      packSize: items.packSize,
      storageType: items.storageType,
      isActive: items.isActive,
    })
    .from(items)
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(eq(items.isActive, true))
    .orderBy(items.category, items.name);

  // 判斷使用者角色
  let userRole = "staff";
  if (auth.source === "cookie") {
    const session = verifySession<{ role: string }>(request.cookies.get("dragon-session")?.value || "");
    userRole = session?.role || "staff";
  } else if (auth.source === "system-key") {
    userRole = auth.role === "admin" ? "admin" : "staff";
  } else if (auth.source === "personal-token") {
    userRole = auth.role === "admin" ? "admin" : "staff";
  }

  // 伺服器端篩選（分類、搜尋）
  let filtered = allItems;
  if (category) {
    filtered = filtered.filter((item) => item.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.aliases?.some((a) => a.toLowerCase().includes(q))
    );
  }

  const result = filtered.map((item) => {
    const effectiveStorePrice = getEffectiveStorePrice(item.costPrice, item.storePrice);

    if (userRole === "admin" || userRole === "buyer") {
      return {
        ...item,
        costPrice: item.costPrice,
        storePrice: effectiveStorePrice,
        sellPrice: item.sellPrice,
      };
    } else if (userRole === "manager") {
      return {
        ...item,
        costPrice: effectiveStorePrice,
        storePrice: undefined,
        sellPrice: item.sellPrice,
      };
    } else {
      return {
        ...item,
        costPrice: 0,
        storePrice: undefined,
        sellPrice: 0,
      };
    }
  });

  // 分頁回傳（帶 limit 參數時）
  if (limit !== null && limit > 0) {
    const paginated = result.slice(offset, offset + limit);
    return NextResponse.json({
      data: paginated,
      meta: { total: result.length, limit, offset, hasMore: offset + limit < result.length },
    });
  }

  // 向下相容：不帶 limit 時回傳全部陣列
  return NextResponse.json(result);
}
