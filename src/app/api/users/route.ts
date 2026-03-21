/**
 * 使用者 API
 * GET /api/users — 讀取所有使用者（不含 PIN hash）
 * POST /api/users — 新增使用者
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, stores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      role: users.role,
      storeId: users.storeId,
      storeName: stores.name,
      hasApiToken: users.apiToken,
      isActive: users.isActive,
      createdAt: users.createdAt,
      allowedSuppliers: users.allowedSuppliers,
    })
    .from(users)
    .leftJoin(stores, eq(users.storeId, stores.id))
    .orderBy(users.role, users.name);

  // 只回傳「有沒有 token」，不回傳 token 值（安全考量）
  const safeUsers = allUsers.map(u => ({
    ...u,
    hasApiToken: !!u.hasApiToken,
    allowedSuppliers: u.allowedSuppliers ?? [],
  }));
  return NextResponse.json(safeUsers);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { name, phone, pin, role, storeId } = body as {
    name: string;
    phone: string;
    pin: string;
    role: string;
    storeId: number | null;
  };

  if (!name || !phone || !pin) {
    return NextResponse.json({ error: "姓名、手機號碼、PIN 碼為必填" }, { status: 400 });
  }
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN 碼必須是 4 位數字" }, { status: 400 });
  }

  // 檢查手機號碼是否重複
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "此手機號碼已被使用" }, { status: 409 });
  }

  const pinHash = await hash(pin, 10);
  const [newUser] = await db
    .insert(users)
    .values({
      name,
      phone,
      pinHash,
      role: role || "staff",
      storeId: storeId || null,
    })
    .returning();

  return NextResponse.json({ id: newUser.id, name: newUser.name }, { status: 201 });
}
