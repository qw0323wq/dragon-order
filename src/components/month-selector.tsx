'use client'

/**
 * 月份選擇器 — 統一 UI 元件
 *
 * 原儀表板 + 帳務頁各自實作一套 ChevronLeft/Right + 顯示 + 回本月邏輯，
 * 現在統一用此元件，父層只管 value/onChange state（或搭配 useMonthSelector hook）。
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMonthDisplay, addMonths, formatMonth } from '@/lib/format';

interface MonthSelectorProps {
  /** 當前月份 YYYY-MM */
  value: string;
  /** 變更時呼叫 */
  onChange: (month: string) => void;
  /** 是否顯示「回本月」按鈕（不在本月時才顯示） */
  showResetToCurrent?: boolean;
  /** 額外 class */
  className?: string;
}

export function MonthSelector({
  value,
  onChange,
  showResetToCurrent = true,
  className = '',
}: MonthSelectorProps) {
  const currentMonth = formatMonth(new Date());
  const isCurrent = value === currentMonth;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        aria-label="上個月"
        onClick={() => onChange(addMonths(value, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-sm font-medium min-w-[90px] text-center tabular-nums">
        {formatMonthDisplay(value)}
      </span>
      <Button
        variant="outline"
        size="sm"
        aria-label="下個月"
        onClick={() => onChange(addMonths(value, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
      {showResetToCurrent && !isCurrent && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-1"
          onClick={() => onChange(currentMonth)}
        >
          回本月
        </Button>
      )}
    </div>
  );
}
