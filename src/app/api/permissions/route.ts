/**
 * 角色權限 API
 * GET  /api/permissions — 讀取所有角色的權限設定
 * PUT  /api/permissions — 更新角色權限
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rolePermissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const perms = await db.select().from(rolePermissions).orderBy(rolePermissions.role);
  return NextResponse.json(perms);
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { role, allowedPages } = body as {
    role: string;
    allowedPages: string[];
  };

  if (!role || !Array.isArray(allowedPages)) {
    return NextResponse.json({ error: "role 和 allowedPages 為必填" }, { status: 400 });
  }

  // Upsert：有就更新，沒有就新增
  const [existing] = await db
    .select()
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role))
    .limit(1);

  if (existing) {
    await db
      .update(rolePermissions)
      .set({ allowedPages, updatedAt: new Date() })
      .where(eq(rolePermissions.role, role));
  } else {
    await db.insert(rolePermissions).values({
      role,
      allowedPages,
      updatedAt: new Date(),
    });
  }

  return NextResponse.json({ success: true });
}
