import { getSessionUser } from "@/app/actions/auth";
import OrderPageClient from "@/components/order/order-page-client";
import { db } from "@/lib/db";
import { items, suppliers, stores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * 員工叫貨頁（Server Component）
 * 從 DB 讀取品項+門市，傳給 Client Component 渲染互動 UI
 */
export default async function OrderPage() {
  const user = (await getSessionUser())!;

  // 從 DB 讀取品項（含供應商名稱）
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
    })
    .from(items)
    .innerJoin(suppliers, eq(items.supplierId, suppliers.id))
    .where(eq(items.isActive, true))
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
