import * as React from "react"
import { cn } from "@/lib/utils"

interface StatCardProps {
  /** 指標名稱，如「本月採購額」 */
  label: string
  /** 主要數值（已格式化的字串或 node） */
  value: React.ReactNode
  /** 右上角圖示 */
  icon?: React.ElementType
  /** 圖示底色 + 前景，如 "bg-red-100 text-red-600"（預設品牌色） */
  accent?: string
  /** 副標，如「本月叫貨次數」 */
  hint?: React.ReactNode
  /** 趨勢徽章，通常放 <DeltaBadge />（顯示在 hint 前） */
  trend?: React.ReactNode
  className?: string
}

/**
 * 統計卡（KPI tile）— 全站統一的數字指標卡。
 * 數值用 tabular-nums 對齊、font-heading 放大；可選趨勢徽章 + 副標。
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "bg-primary/10 text-primary",
  hint,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-2xl font-semibold leading-tight tabular-nums text-foreground">
          {value}
        </p>
        {(trend || hint) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {trend}
            {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
          </div>
        )}
      </div>
      {Icon && (
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            accent,
          )}
        >
          <Icon className="size-5" />
        </div>
      )}
    </div>
  )
}
