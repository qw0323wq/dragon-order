import { getSessionUser } from "@/app/actions/auth";
import OrderPageClient from "@/components/order/order-page-client";
import { db } from "@/lib/db";
import { items, suppliers, stores, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * 員工叫貨頁（Server Component）
 * 從 DB 讀取品項+門市，傳給 Client Component 渲染互動 UI
 *
 * CRITICAL: owner/manager 可叫所有供應商的品項
 * staff 若 allowedSuppliers 不為空，只能叫該清單內供應商的品項
 */
export default async function OrderPage() {
  const user = (await getSessionUser())!;

  // 取得該使用者的 allowedSuppliers（用於過濾品項）
  let allowedSupplierIds: number[] = [];
  if (user.role === "staff") {
    const [dbUser] = await db
      .select({ allowedSuppliers: users.allowedSuppliers })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    allowedSupplierIds = dbUser?.allowedSuppliers ?? [];
  }

  // 分店採購價加價比例
  const markup = parseFloat(process.env.COST_MARKUP || "1.2");

  // 從 DB 讀取品項（含供應商名稱）
  // CRITICAL: staff 且 allowedSuppliers 不為空 → 只顯示該供應商的品項
  const rawItems = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      unit: items.unit,
      cost_price: items.costPrice,
      sell_price: items.sellPrice,
      aliases: items.aliases,
      supplierName: suppliers.name,
      supplierId: suppliers.id,
    })
    .from(items)
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(
      allowedSupplierIds.length > 0
        ? and(eq(items.isActive, true), inArray(items.supplierId, allowedSupplierIds))
        : eq(items.isActive, true)
    )
    .orderBy(items.category, items.name);

  // 依角色處理價格
  // owner：顯示廠商進貨價
  // manager：顯示分店採購價（加 20%）
  // staff：不顯示價格
  const dbItems = rawItems.map((item) => {
    if (user.role === "owner") {
      return item; // 看廠商進貨價
    } else if (user.role === "manager") {
      return { ...item, cost_price: Math.round(item.cost_price * markup) }; // 看分店採購價
    } else {
      return { ...item, cost_price: 0, sell_price: 0 }; // 員工看不到價格
    }
  });

  // 從 DB 讀取門市
  const dbStores = await db
    .select({ id: stores.id, name: stores.name })
    .from(stores)
    .orderBy(stores.sortOrder);

  return (
    <OrderPageClient
      user={user}
      items={dbItems as any}
      stores={dbStores}
    />
  );
}
