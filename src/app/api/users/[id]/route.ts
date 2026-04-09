/**
 * 單一使用者 API
 * PATCH /api/users/[id] — 更新使用者（名稱、角色、門市、啟用/停用、重設 PIN）
 * DELETE /api/users/[id] — 停用使用者（軟刪除）
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { requireAdmin, VALID_ROLES } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const userId = parseInt(id);
  const body = await request.json();
  const { name, employeeId, phone, role, storeId, isActive, newPassword, newPin, generateToken, revokeToken, allowedSuppliers } = body as {
    name?: string;
    employeeId?: string;
    phone?: string;
    role?: string;
    storeId?: number | null;
    isActive?: boolean;
    newPassword?: string;
    newPin?: string; // 向下相容
    generateToken?: boolean;
    revokeToken?: boolean;
    allowedSuppliers?: number[];
  };

  // 組合要更新的欄位
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (employeeId !== undefined) {
    // 檢查員工編號是否跟其他人重複
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.employeeId, employeeId))
      .limit(1);
    if (existing && existing.id !== userId) {
      return NextResponse.json({ error: "此員工編號已被使用" }, { status: 409 });
    }
    updates.employeeId = employeeId;
  }
  if (phone !== undefined) updates.phone = phone || null;
  if (role !== undefined) {
    // Role 白名單驗證
    if (!(VALID_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: `無效的角色，允許值: ${VALID_ROLES.join(", ")}` }, { status: 400 });
    }
    updates.role = role;
  }
  if (storeId !== undefined) updates.storeId = storeId || null;
  if (isActive !== undefined) updates.isActive = isActive;
  // 重設密碼（支援 newPassword 和舊的 newPin）
  const pwd = newPassword || newPin;
  if (pwd) {
    if (pwd.length < 4) {
      return NextResponse.json({ error: "密碼至少 4 個字元" }, { status: 400 });
    }
    updates.pinHash = await hash(pwd, 10);
  }
  // 產生新的 API Token
  if (generateToken) {
    const newToken = randomBytes(32).toString("hex");
    updates.apiToken = newToken;
  }
  // 撤銷 API Token
  if (revokeToken) {
    updates.apiToken = null;
  }
  // 更新叫貨權限（空陣列 = 全部可叫）
  if (allowedSuppliers !== undefined) {
    updates.allowedSuppliers = allowedSuppliers;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "沒有要更新的欄位" }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  // 如果有產生 token，回傳給前端顯示（只顯示一次）
  if (generateToken && updates.apiToken) {
    return NextResponse.json({ success: true, apiToken: updates.apiToken });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const userId = parseInt(id);

  // 軟刪除：設 isActive = false
  await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
  return NextResponse.json({ success: true });
}
