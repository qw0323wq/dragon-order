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

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

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

  const result = allItems.map((item) => {
    const effectiveStorePrice = getEffectiveStorePrice(item.costPrice, item.storePrice);

    if (userRole === "admin" || userRole === "buyer") {
      // 管理員/採購：看進貨價 + 店家採購價 + 售價
      return {
        ...item,
        costPrice: item.costPrice,
        storePrice: effectiveStorePrice,
        sellPrice: item.sellPrice,
      };
    } else if (userRole === "manager") {
      // 店長：店家採購價當作他的成本，看不到進貨價
      return {
        ...item,
        costPrice: effectiveStorePrice,
        storePrice: undefined,
        sellPrice: item.sellPrice,
      };
    } else {
      // 員工：看不到任何價格
      return {
        ...item,
        costPrice: 0,
        storePrice: undefined,
        sellPrice: 0,
      };
    }
  });

  return NextResponse.json(result);
}
