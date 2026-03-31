/**
 * POST /api/logout — 清除 session cookie
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("dragon-session");
  return NextResponse.json({ ok: true });
}
