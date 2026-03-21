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
import { requireAdmin } from "@/lib/api-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const userId = parseInt(id);
  const body = await request.json();
  const { name, phone, role, storeId, isActive, newPin, generateToken, revokeToken } = body as {
    name?: string;
    phone?: string;
    role?: string;
    storeId?: number | null;
    isActive?: boolean;
    newPin?: string;
    generateToken?: boolean;
    revokeToken?: boolean;
  };

  // 組合要更新的欄位
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) {
    // 檢查手機號碼是否跟其他人重複
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    if (existing && existing.id !== userId) {
      return NextResponse.json({ error: "此手機號碼已被使用" }, { status: 409 });
    }
    updates.phone = phone;
  }
  if (role !== undefined) updates.role = role;
  if (storeId !== undefined) updates.storeId = storeId || null;
  if (isActive !== undefined) updates.isActive = isActive;
  if (newPin) {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      return NextResponse.json({ error: "PIN 碼必須是 4 位數字" }, { status: 400 });
    }
    updates.pinHash = await hash(newPin, 10);
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
