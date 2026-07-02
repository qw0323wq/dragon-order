"use client";

/**
 * 後台錯誤邊界 — 任何 dashboard 頁面 render 崩潰（如 session 過期後資料變
 * 非預期形狀、.map 於非陣列）都會落到這裡，顯示友善畫面 + 重試，
 * 避免整頁白屏。
 */
import { useEffect } from "react";
import { AlertTriangle, RotateCcw, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
      <AlertTriangle className="size-10 text-orange-500" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">頁面載入發生問題</h2>
        <p className="text-sm text-muted-foreground">
          可能是登入逾時或連線不穩。請重新整理，或重新登入。
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="gap-1.5" onClick={() => reset()}>
          <RotateCcw className="size-4" /> 重新載入
        </Button>
        <Button
          className="gap-1.5"
          onClick={() => { window.location.href = "/"; }}
        >
          <LogIn className="size-4" /> 重新登入
        </Button>
      </div>
    </div>
  );
}
