/**
 * 門市 API
 * GET /api/stores — 讀取所有門市
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stores } from "@/lib/db/schema";

export async function GET() {
  const allStores = await db
    .select()
    .from(stores)
    .orderBy(stores.sortOrder);

  return NextResponse.json(allStores);
}
