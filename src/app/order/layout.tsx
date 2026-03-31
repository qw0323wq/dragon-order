import { redirect } from "next/navigation";
import { getSessionUser } from "@/app/actions/auth";

/**
 * 叫貨頁 Layout（Server Component）
 * 負責：驗證登入狀態、提供正確的背景色與 padding
 * CRITICAL: 這裡做 auth guard，未登入直接 redirect，避免任何子頁面暴露
 */
export default async function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    // 未登入跳回登入頁
    redirect("/");
  }

  return (
    // 灰色背景讓卡片有層次感，pb-28 為底部固定購物車留空間
    <div className="min-h-screen bg-gray-50 pb-28">
      {children}
    </div>
  );
}
