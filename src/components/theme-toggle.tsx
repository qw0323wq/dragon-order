"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * 深淺色切換 — 只有 light / dark 兩態（不跟系統連動，讓使用者明確決定）。
 *
 * CRITICAL: 必須等 mounted 後才渲染圖示。
 * 伺服器端不知道使用者主題，若直接依 theme 渲染會造成 hydration 不一致（React 報錯 + 圖示閃爍）。
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    // 佔位：保留同樣尺寸，避免 header 在 hydration 前後跳動
    return <Button variant="ghost" size="icon" className={className} aria-label="切換深淺色" disabled />
  }

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "切換成淺色模式" : "切換成深色模式"}
      title={isDark ? "淺色模式" : "深色模式"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}
