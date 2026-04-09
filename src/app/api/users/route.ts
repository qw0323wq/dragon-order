/**
 * 使用者 API
 * GET /api/users — 讀取所有使用者（不含密碼 hash）
 * POST /api/users — 新增使用者（員工編號 + 密碼）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, stores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { requireAdmin, VALID_ROLES } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      employeeId: users.employeeId,
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
  const { name, employeeId, password, phone, role, storeId } = body as {
    name: string;
    employeeId: string;
    password: string;
    phone?: string;
    role: string;
    storeId: number | null;
  };

  if (!name || !employeeId || !password) {
    return NextResponse.json({ error: "姓名、員工編號、密碼為必填" }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "密碼至少 4 個字元" }, { status: 400 });
  }

  // Role 白名單驗證
  if (role && !(VALID_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: `無效的角色，允許值: ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }

  // 檢查員工編號是否重複
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.employeeId, employeeId))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "此員工編號已被使用" }, { status: 409 });
  }

  const pinHash = await hash(password, 10);
  const [newUser] = await db
    .insert(users)
    .values({
      name,
      employeeId,
      phone: phone || null,
      pinHash,
      role: role || "staff",
      storeId: storeId || null,
    })
    .returning();

  return NextResponse.json({ id: newUser.id, name: newUser.name }, { status: 201 });
}
