"use client";

/**
 * 員工叫貨頁錯誤邊界 — 任何 /order render 崩潰都落這裡（手機優先），
 * 顯示友善畫面 + 重試，避免員工看到白屏不知所措。
 */
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OrderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[order error boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4 px-6 text-center">
      <AlertTriangle className="size-10 text-orange-500" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">頁面出了點問題</h2>
        <p className="text-sm text-muted-foreground">請重新載入試試，或重新登入。</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 rounded-xl gap-1.5" onClick={() => reset()}>
          <RotateCcw className="size-4" /> 重新載入
        </Button>
        <Button className="h-11 rounded-xl" onClick={() => { window.location.href = "/"; }}>
          重新登入
        </Button>
      </div>
    </div>
  );
}
