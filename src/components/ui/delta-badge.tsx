import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface DeltaBadgeProps {
  /** 變化百分比（已是百分比數值，例：4.55 代表 +4.55%）。0 或 null 顯示持平 */
  percent?: number | null
  /** 附帶的絕對變化（選填，例："+$20"），顯示在括號內 */
  amount?: string
  /**
   * 配色方向。預設「漲紅跌綠」（台灣慣例，成本/價格用）。
   * invert=true → 漲綠跌紅（適用「數量增加是好事」的情境）
   */
  invert?: boolean
  size?: "sm" | "md"
  className?: string
}

/**
 * 漲跌徽章 — 藥丸樣式，帶箭頭 icon + 有號百分比。
 * 全站統一用它顯示價格漲跌、月比、店比等變化，避免各頁配色/格式不一致。
 */
export function DeltaBadge({ percent, amount, invert = false, size = "sm", className }: DeltaBadgeProps) {
  const p = percent ?? 0
  const up = p > 0
  const down = p < 0
  const flat = !up && !down

  // 漲紅跌綠（invert 則相反）
  const isRed = invert ? down : up
  const tone = flat
    ? "bg-muted text-muted-foreground"
    : isRed
      ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400"
      : "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400"
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full font-medium tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm",
        tone,
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
      {up ? "+" : ""}
      {p.toFixed(1)}%
      {amount && <span className="ml-0.5 opacity-70">({amount})</span>}
    </span>
  )
}
