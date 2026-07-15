"use client";

import { useState } from "react";
import { useActionState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/app/actions/auth";
import { UserIcon, LockIcon, EyeIcon, EyeOffIcon } from "lucide-react";

/**
 * 登入表單 — 員工編號 + 密碼
 * 現代簡約風：品牌 logo + 大標題 + icon 輸入框 + 全寬按鈕（參考 21st.dev sign-in-flo 風格）
 */
export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-7 shadow-xl shadow-black/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 品牌 Logo（去背，直接放無外框）+ 標題 */}
      <div className="mb-7 flex flex-col items-center text-center">
        <Image
          src="/feilong-logo.png"
          alt="肥龍老火鍋"
          width={900}
          height={708}
          priority
          className="mb-4 h-auto w-40 select-none"
        />
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
          歡迎回來
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          採購系統．員工登入
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        {/* 員工編號 */}
        <div className="relative">
          <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="employeeId"
            name="employeeId"
            type="text"
            placeholder="員工編號"
            aria-label="員工編號"
            autoComplete="username"
            className="h-12 rounded-xl pl-10 text-base"
            disabled={isPending}
            required
          />
        </div>

        {/* 密碼 */}
        <div className="relative">
          <LockIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="密碼"
            aria-label="密碼"
            autoComplete="current-password"
            className="h-12 rounded-xl pl-10 pr-10 text-base"
            disabled={isPending}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            tabIndex={-1}
            aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
          >
            {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>

        {/* 錯誤訊息 */}
        {state?.error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
          >
            {state.error}
          </p>
        )}

        {/* 登入按鈕 */}
        <Button
          type="submit"
          className="mt-2 h-12 w-full rounded-xl text-base font-semibold"
          disabled={isPending}
        >
          {isPending ? "登入中..." : "登入"}
        </Button>
      </form>
    </div>
  );
}
