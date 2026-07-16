import * as React from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  /** 中央圖示 */
  icon?: React.ElementType
  /** 主標題，如「此期間沒有消耗資料」 */
  title: string
  /** 說明 / 引導文字 */
  description?: string
  /** 行動按鈕，通常放 <Button>（例：跳去建 BOM 配方） */
  action?: React.ReactNode
  className?: string
}

/**
 * 空狀態 — 取代各頁純文字「沒有資料」。
 * 圖示 + 主標 + 說明 + 選填的引導按鈕，給使用者下一步。
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-4 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-6" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}
