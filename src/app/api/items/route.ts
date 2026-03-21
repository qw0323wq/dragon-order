/**
 * 品項 API — 讀取品項列表（含供應商資訊）
 * GET /api/items
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const allItems = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      unit: items.unit,
      costPrice: items.costPrice,
      sellPrice: items.sellPrice,
      spec: items.spec,
      aliases: items.aliases,
      supplierId: items.supplierId,
      supplierName: suppliers.name,
      isActive: items.isActive,
    })
    .from(items)
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(eq(items.isActive, true))
    .orderBy(items.category, items.name);

  return NextResponse.json(allItems);
}
