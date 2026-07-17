"use client"

import { useEffect, useRef, useState } from "react"

interface CountUpProps {
  /** 目標數值 */
  value: number
  /** 把數字轉成顯示字串（如 formatCurrency）。預設四捨五入成整數 */
  format?: (n: number) => string
  /** 動畫時間（ms） */
  duration?: number
  className?: string
}

/**
 * 數字滾動動畫 — 從目前顯示值平滑跑到新值（切月份時數字會滾動而不是硬跳）。
 *
 * CRITICAL: 尊重 prefers-reduced-motion — 使用者若關閉動畫，直接顯示結果不做動畫。
 * 動畫中途 value 又變（例如快速連點切月）時，從「當下顯示值」接續跑，不會跳回舊值。
 */
export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  duration = 500,
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState(value)
  // 記住當下畫面上的值，讓動畫被打斷時能從這裡接續
  const displayRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = displayRef.current
    const to = value

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    if (prefersReduced || from === to) {
      displayRef.current = to
      setDisplay(to)
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      const current = from + (to - from) * eased
      displayRef.current = current
      setDisplay(current)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    // CRITICAL 安全網：分頁在背景時瀏覽器會把 requestAnimationFrame 完全節流，
    // 動畫不會跑 → 數字會永遠停在舊值（顯示錯誤金額，比沒動畫嚴重得多）。
    // 這個 timer 保證時間到一定收斂到正確值：最壞情況只是「沒有動畫」，但數字永遠是對的。
    const settle = setTimeout(() => {
      displayRef.current = to
      setDisplay(to)
    }, duration + 120)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      clearTimeout(settle)
    }
  }, [value, duration])

  return <span className={className}>{format(display)}</span>
}
