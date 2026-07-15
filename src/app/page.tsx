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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-background to-muted/50 px-4 py-12">
      {/* 柔和品牌暖光背景 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      {/* 登入卡片（Client Component 處理互動，品牌與標題已收進卡片內） */}
      <LoginForm />
    </main>
  );
}
