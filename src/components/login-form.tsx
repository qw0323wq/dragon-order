"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { login } from "@/app/actions/auth";
import { PhoneIcon, LockIcon, LogInIcon } from "lucide-react";

/**
 * 登入表單
 * 使用 useActionState 處理 Server Action 的回傳錯誤訊息
 */
export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <Card className="w-full max-w-sm shadow-lg border-orange-100">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-center text-gray-700">
          員工登入
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          {/* 手機號碼欄位 */}
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="phone"
              className="text-sm font-medium text-gray-600"
            >
              手機號碼
            </Label>
            <div className="relative">
              <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="09xx-xxx-xxx"
                autoComplete="tel"
                inputMode="tel"
                // 大字體方便手機輸入
                className="pl-9 h-12 text-base"
                disabled={isPending}
                required
              />
            </div>
          </div>

          {/* PIN 碼欄位 */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="pin" className="text-sm font-medium text-gray-600">
              4 位 PIN 碼
            </Label>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <Input
                id="pin"
                name="pin"
                type="password"
                placeholder="••••"
                autoComplete="current-password"
                inputMode="numeric"
                maxLength={4}
                // 大字體，置中顯示 PIN 碼
                className="pl-9 h-12 text-base tracking-[0.5em]"
                disabled={isPending}
                required
              />
            </div>
          </div>

          {/* 錯誤訊息 */}
          {state?.error && (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center"
            >
              {state.error}
            </p>
          )}

          {/* 登入按鈕：全寬、大按鈕、火鍋紅主題色 */}
          <Button
            type="submit"
            // CRITICAL: 使用 bg-primary（火鍋紅）讓按鈕套用主題色
            className="h-12 w-full text-base font-semibold gap-2 mt-1"
            disabled={isPending}
          >
            <LogInIcon className="size-4" />
            {isPending ? "登入中..." : "登入"}
          </Button>
        </form>

        {/* 測試帳號提示（開發期間顯示，正式上線請移除） */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
            <p className="font-semibold mb-1">測試帳號：</p>
            <p>老闆：0900000001 / 1234</p>
            <p>林森店員工：0900000002 / 0000</p>
            <p>信義店員工：0900000003 / 0000</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
