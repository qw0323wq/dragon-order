/**
 * 門市 API
 * GET /api/stores — 讀取所有門市
 * PATCH /api/stores — 更新門市資料
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, requireAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth.ok) return auth.response;
  const allStores = await db
    .select()
    .from(stores)
    .orderBy(stores.sortOrder);

  return NextResponse.json(allStores);
}

export async function PATCH(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { id, name, companyName, taxId, address, hours, manager, phone } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少門市 ID" }, { status: 400 });
  }

  const [updated] = await db
    .update(stores)
    .set({
      ...(name && { name }),
      companyName: companyName ?? null,
      taxId: taxId ?? null,
      ...(address && { address }),
      ...(hours && { hours }),
      manager: manager ?? null,
      phone: phone ?? null,
    })
    .where(eq(stores.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "找不到門市" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
