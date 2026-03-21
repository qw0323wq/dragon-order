"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** Session cookie 有效期：7 天（秒） */
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** Cookie 名稱 */
const SESSION_COOKIE = "dragon-session";

export type UserRole = "staff" | "manager" | "owner";

export interface SessionUser {
  id: number;
  name: string;
  role: UserRole;
  store_id: number | null;
}

/**
 * 登入 Server Action
 * 接收 FormData，驗證手機號碼 + PIN，設定 session cookie，跳轉對應頁面
 */
export async function login(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const phone = (formData.get("phone") as string | null)?.trim() ?? "";
  const pin = (formData.get("pin") as string | null)?.trim() ?? "";

  // 基本格式驗證
  if (!phone || !pin) {
    return { error: "請輸入手機號碼和 PIN 碼" };
  }
  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return { error: "PIN 碼必須是 4 位數字" };
  }

  // 查詢使用者
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  if (!user || !user.isActive) {
    return { error: "手機號碼或 PIN 碼錯誤" };
  }

  // 驗證 PIN（bcrypt）
  const pinValid = await compare(pin, user.pinHash);
  if (!pinValid) {
    return { error: "手機號碼或 PIN 碼錯誤" };
  }

  // 建立 session 資料（只存非敏感資訊）
  const sessionData: SessionUser = {
    id: user.id,
    name: user.name,
    role: user.role as UserRole,
    store_id: user.storeId,
  };

  // 設定 httpOnly session cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  // 根據角色跳轉不同頁面
  // CRITICAL: redirect 必須在 try/catch 外面呼叫，否則會被 catch 攔截
  if (user.role === "staff") {
    redirect("/order");
  } else {
    redirect("/dashboard");
  }
}

/**
 * 登出 Server Action
 * 清除 session cookie，跳轉回登入頁
 */
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/");
}

/**
 * 從 cookie 讀取目前登入的使用者
 * 在 Server Component 中呼叫
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
