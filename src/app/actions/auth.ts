"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { users, rolePermissions } from "@/lib/db/schema";
import { signSession, verifySession } from "@/lib/session";
import type { AppRole } from "@/lib/permissions";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

/** Session cookie 有效期：7 天（秒） */
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** Cookie 名稱 */
const SESSION_COOKIE = "dragon-session";

export type UserRole = AppRole;

export interface SessionUser {
  id: number;
  name: string;
  role: UserRole;
  store_id: number | null;
  allowed_pages: string[];
}

/**
 * 登入 Server Action
 * 接收 FormData，驗證員工編號 + 密碼，設定 signed session cookie
 */
export async function login(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const employeeId = (formData.get("employeeId") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null)?.trim() ?? "";

  if (!employeeId || !password) {
    return { error: "請輸入員工編號和密碼" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.employeeId, employeeId))
    .limit(1);
  if (!user || !user.isActive) {
    return { error: "員工編號或密碼錯誤" };
  }

  const valid = await compare(password, user.pinHash);
  if (!valid) {
    return { error: "員工編號或密碼錯誤" };
  }

  const [perm] = await db
    .select()
    .from(rolePermissions)
    .where(eq(rolePermissions.role, user.role))
    .limit(1);
  const allowedPages = perm?.allowedPages ?? DEFAULT_PERMISSIONS[user.role as AppRole] ?? [];

  const sessionData: SessionUser = {
    id: user.id,
    name: user.name,
    role: user.role as UserRole,
    store_id: user.storeId,
    allowed_pages: allowedPages,
  };

  // HMAC 簽名後存入 cookie（防竄改）
  const signed = signSession(sessionData);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  if (user.role === "staff") {
    redirect("/order");
  } else {
    redirect("/dashboard");
  }
}

/**
 * 登出 Server Action
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/");
}

/**
 * 從 cookie 讀取目前登入的使用者（驗證簽名）
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  return verifySession<SessionUser>(raw);
}
