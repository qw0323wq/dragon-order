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
  /**
   * 緊湊版 — 給「嵌在展開明細/卡片內」的次級指標用。
   * 預設版是頁面級 KPI（p-4 + text-2xl），塞進巢狀區塊會過胖（手機尤其明顯）。
   */
  compact?: boolean
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
  compact = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-sm",
        compact ? "gap-2 p-2.5" : "gap-3 p-4",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {/* 數值不換行：避免「0」與單位「副」被拆成兩行 */}
        <p
          className={cn(
            "font-heading font-semibold leading-tight tabular-nums whitespace-nowrap text-foreground",
            compact ? "text-lg" : "text-2xl",
          )}
        >
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
            "flex shrink-0 items-center justify-center rounded-lg",
            compact ? "size-7" : "size-9",
            accent,
          )}
        >
          <Icon className={compact ? "size-4" : "size-5"} />
        </div>
      )}
    </div>
  )
}
