/**
 * ⚠️ P2-C8: /dashboard/purchase-orders 已整合到 /dashboard/orders 的「叫貨單」Tab
 *
 * 原因：兩頁功能 100% 重複（都是選日期→看 PO 列表→產生叫貨單→複製/列印），
 * Terry 反映「資訊多難測」，合併後訂單相關操作集中在 /orders，減少認知負擔。
 *
 * 這個檔案保留作為 bookmark compat 的 redirect，舊網址不會 404。
 *
 * 若之後需要獨立頁面（例如只看 PO 不看訂單），可在這重建。
 */
import { redirect } from 'next/navigation';

export default function PurchaseOrdersRedirect() {
  redirect('/dashboard/orders?tab=purchase-orders');
}
