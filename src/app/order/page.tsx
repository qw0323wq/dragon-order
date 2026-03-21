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
  const dbItems = await db
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
        // staff 且有設定可叫供應商：只顯示指定供應商的啟用品項
        ? and(eq(items.isActive, true), inArray(items.supplierId, allowedSupplierIds))
        // owner/manager 或 staff 未設限制：顯示所有啟用品項
        : eq(items.isActive, true)
    )
    .orderBy(items.category, items.name);

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
