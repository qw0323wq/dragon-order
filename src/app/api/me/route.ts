/**
 * GET /api/me — 回傳目前登入使用者的 session 資訊（驗證簽名）
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/session";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("dragon-session")?.value;
  if (!raw) return NextResponse.json(null, { status: 401 });

  const session = verifySession<{
    id: number; name: string; role: string;
    store_id: number | null; allowed_pages: string[];
  }>(raw);

  if (!session) return NextResponse.json(null, { status: 401 });

  return NextResponse.json({
    id: session.id,
    name: session.name,
    role: session.role,
    store_id: session.store_id,
    allowed_pages: session.allowed_pages ?? ['*'],
  });
}
