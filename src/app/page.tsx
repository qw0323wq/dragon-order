import { redirect } from "next/navigation";
import { getSessionUser } from "@/app/actions/auth";
import LoginForm from "@/components/login-form";

/**
 * 登入頁（Server Component）
 * 若已登入則自動跳轉，避免已登入使用者看到登入畫面
 */
export default async function LoginPage() {
  const user = await getSessionUser();

  if (user) {
    // CRITICAL: 已登入就直接跳轉，不顯示登入頁
    if (user.role === "staff") {
      redirect("/order");
    } else {
      redirect("/dashboard");
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-red-50 to-orange-50 px-4 py-12">
      {/* Logo 區 */}
      <div className="mb-8 text-center">
        <div className="text-6xl mb-3 select-none" aria-hidden="true">
          🔥🍲
        </div>
        <h1 className="text-2xl font-bold text-red-700 tracking-tight">
          肥龍叫貨系統
        </h1>
        <p className="text-sm text-orange-600 mt-1">肥龍老火鍋 採購管理</p>
      </div>

      {/* 登入表單（Client Component 處理互動） */}
      <LoginForm />
    </main>
  );
}
