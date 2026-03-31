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

  // 從 DB 讀取品項（含供應商名稱）
  // CRITICAL: staff 且 allowedSuppliers 不為空 → 只顯示該供應商的品項
  const rawItems = await db
    .select({
      id: items.id,
      name: items.name,
      category: items.category,
      unit: items.unit,
      cost_price: items.costPrice,
      store_price: items.storePrice,
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
  // admin/buyer：顯示廠商進貨價
  // manager：顯示店家採購價
  // staff：不顯示價格
  const markup = parseFloat(process.env.COST_MARKUP || "1.2");
  const dbItems = rawItems.map((item) => {
    if (user.role === "admin" || user.role === "buyer") {
      return item; // 看廠商進貨價
    } else if (user.role === "manager") {
      // 店長看店家採購價
      const effectiveStorePrice = item.store_price > 0
        ? item.store_price
        : Math.round(item.cost_price * markup);
      return { ...item, cost_price: effectiveStorePrice, store_price: 0, sell_price: item.sell_price };
    } else {
      return { ...item, cost_price: 0, store_price: 0, sell_price: 0 }; // 員工看不到
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
