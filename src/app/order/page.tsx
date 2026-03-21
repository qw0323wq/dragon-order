import { getSessionUser } from "@/app/actions/auth";
import OrderPageClient from "@/components/order/order-page-client";
import { MOCK_ITEMS, MOCK_STORES } from "@/lib/mock-data";

/**
 * 員工叫貨頁（Server Component）
 * 讀取登入使用者資料，傳給 Client Component 渲染互動 UI
 * 正式版：在此向 DB 查詢品項清單和門市資料
 */
export default async function OrderPage() {
  // layout.tsx 已做 auth guard，這裡可以直接 assert non-null
  const user = (await getSessionUser())!;

  return (
    <OrderPageClient
      user={user}
      items={MOCK_ITEMS}
      stores={MOCK_STORES}
    />
  );
}
