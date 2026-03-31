"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { login } from "@/app/actions/auth";
import { UserIcon, LockIcon, LogInIcon, EyeIcon, EyeOffIcon } from "lucide-react";

/**
 * 登入表單
 * 使用員工編號 + 密碼登入
 */
export default function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card className="w-full max-w-sm shadow-lg border-primary/15">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-center text-foreground">
          員工登入
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          {/* 員工編號 */}
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="employeeId"
              className="text-sm font-medium text-muted-foreground"
            >
              員工編號
            </Label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                id="employeeId"
                name="employeeId"
                type="text"
                placeholder="請輸入員工編號"
                autoComplete="username"
                className="pl-9 h-12 text-base"
                disabled={isPending}
                required
              />
            </div>
          </div>

          {/* 密碼 */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">
              密碼
            </Label>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••"
                autoComplete="current-password"
                className="pl-9 pr-10 h-12 text-base"
                disabled={isPending}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                tabIndex={-1}
                aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
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

          {/* 登入按鈕 */}
          <Button
            type="submit"
            className="h-12 w-full text-base font-semibold gap-2 mt-1"
            disabled={isPending}
          >
            <LogInIcon className="size-4" />
            {isPending ? "登入中..." : "登入"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
