import { cn } from "@/lib/utils";

/**
 * Skeleton loading 元件 — 取代 Loader2 spinner 提升感知速度
 *
 * 用法：
 *   <Skeleton className="h-4 w-[250px]" />
 *   <Skeleton className="h-10 w-10 rounded-full" />
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/**
 * 表格骨架 — 預載 N 行可自訂
 */
export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * 卡片骨架 — 供應商/品項清單用
 */
export function SkeletonCard() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <Skeleton className="h-5 w-[60%]" />
      <Skeleton className="h-4 w-[40%]" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
      </div>
    </div>
  );
}

/**
 * 統計卡骨架 — 儀表板 KPI 卡片用
 */
export function SkeletonStatCard() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}
