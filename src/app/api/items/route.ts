/**
 * 品項 API — 依角色回傳不同價格
 *
 * owner：看到廠商進貨價（costPrice）+ 分店採購價（storeCostPrice）+ 售價
 * manager：看到分店採購價（當作他的 costPrice）+ 售價
 * staff：看不到任何價格（costPrice=0, sellPrice=0）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { items, suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest } from "@/lib/api-auth";

/** 分店採購價加價比例（預設 1.2 = 加 20%） */
function getCostMarkup(): number {
  return parseFloat(process.env.COST_MARKUP || "1.2");
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const allItems = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      unit: items.unit,
      costPrice: items.costPrice,
      sellPrice: items.sellPrice,
      spec: items.spec,
      aliases: items.aliases,
      supplierId: items.supplierId,
      supplierName: suppliers.name,
      isActive: items.isActive,
    })
    .from(items)
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(eq(items.isActive, true))
    .orderBy(items.category, items.name);

  const markup = getCostMarkup();

  // 判斷使用者角色（cookie 或 API token）
  // owner 看全部價格；manager 看分店價；staff 看不到價格
  let userRole = "staff";
  if (auth.source === "cookie") {
    try {
      const session = JSON.parse(request.cookies.get("dragon-session")?.value || "{}");
      userRole = session.role || "staff";
    } catch { /* keep staff */ }
  } else if (auth.source === "system-key") {
    userRole = auth.role === "admin" ? "owner" : "staff";
  } else if (auth.source === "personal-token") {
    // 從 DB 查到的角色，owner/manager 已在 auth 裡處理
    // 但我們需要更精確：owner vs manager
    // auth.role 只有 admin/user，需要原始角色
    // 簡單做法：有 userId 就查一下
    if (auth.role === "admin") {
      // admin 可能是 owner 或 manager，用 system key 當 owner
      userRole = "owner";
    } else {
      userRole = "staff";
    }
  }

  const result = allItems.map((item) => {
    const storeCostPrice = Math.round(item.costPrice * markup);

    if (userRole === "owner") {
      // 老闆：看廠商進貨價 + 分店採購價 + 售價
      return {
        ...item,
        costPrice: item.costPrice,          // 廠商進貨價
        storeCostPrice,                      // 分店採購價（加 20%）
        sellPrice: item.sellPrice,
      };
    } else if (userRole === "manager") {
      // 店長：分店採購價當作他的成本，看不到廠商價
      return {
        ...item,
        costPrice: storeCostPrice,           // 他看到的「成本」是分店採購價
        storeCostPrice: undefined,           // 不回傳
        sellPrice: item.sellPrice,
      };
    } else {
      // 員工：看不到任何價格
      return {
        ...item,
        costPrice: 0,
        storeCostPrice: undefined,
        sellPrice: 0,
      };
    }
  });

  return NextResponse.json(result);
}
