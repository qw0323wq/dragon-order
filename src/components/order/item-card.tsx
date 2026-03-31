"use client";

import { useState } from "react";
import { CATEGORY_COLORS } from "@/lib/mock-data";
import type { MenuItem } from "@/lib/mock-data";
import { PlusIcon, MinusIcon, CheckIcon } from "lucide-react";

interface ItemCardProps {
  item: MenuItem;
  quantity: number;
  showPrice?: boolean;
  /** 購物車中已有的數量（0 = 不在購物車） */
  cartQty?: number;
  onQuantityChange: (qty: number) => void;
  onAddToCart: () => void;
  /** 快速 +1 加入購物車 */
  onQuickAdd?: () => void;
}

export function ItemCard({
  item, quantity, showPrice = true, cartQty = 0,
  onQuantityChange, onAddToCart, onQuickAdd,
}: ItemCardProps) {
  const colorClass = CATEGORY_COLORS[item.category] ?? "bg-muted text-muted-foreground";
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(quantity));
  const inCart = cartQty > 0;

  function handleInputBlur() {
    const val = parseFloat(inputValue);
    if (!isNaN(val) && val >= 0) {
      onQuantityChange(val);
    }
    setEditing(false);
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleInputBlur();
    }
  }

  // 快速加入：點卡片直接 +1
  function handleQuickAdd(e: React.MouseEvent) {
    // 不要觸發展開
    e.stopPropagation();
    if (onQuickAdd) {
      onQuickAdd();
    }
  }

  return (
    <div className={`bg-card rounded-xl border transition-all ${inCart ? 'border-primary/30 ring-1 ring-primary/10' : 'border-border'}`}>
      {/* 上排：品名 + 資訊 + 快速加入按鈕 */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-muted/30"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-base text-foreground leading-snug">
              {item.name}
            </span>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
              {item.category}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            {item.unit}
            {showPrice && item.cost_price > 0 ? ` · $${item.cost_price}` : ''}
            {inCart && (
              <span className="ml-2 text-primary font-medium">
                · 已加 {cartQty}
              </span>
            )}
          </div>
        </div>

        {/* 快速 +1 按鈕 */}
        <button
          onClick={handleQuickAdd}
          className={`shrink-0 size-12 rounded-xl flex items-center justify-center text-lg font-bold transition-all active:scale-95 ${
            inCart
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-primary text-primary-foreground shadow-sm'
          }`}
          aria-label={`快速加入 ${item.name}`}
        >
          {inCart ? <PlusIcon className="size-5" /> : <PlusIcon className="size-6" />}
        </button>
      </div>

      {/* 展開：精確數量控制 */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground shrink-0">數量</span>
            <div className="flex items-center border border-border rounded-xl overflow-hidden flex-1">
              <button
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                className="w-12 h-12 flex items-center justify-center text-muted-foreground hover:bg-muted active:bg-accent transition-colors"
                aria-label="減少數量"
              >
                <MinusIcon className="size-5" />
              </button>
              {editing ? (
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="flex-1 h-12 text-center text-lg font-bold text-foreground bg-transparent outline-none border-x border-border"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={handleInputBlur}
                  onKeyDown={handleInputKeyDown}
                  autoFocus
                />
              ) : (
                <button
                  className="flex-1 h-12 text-center text-lg font-bold text-foreground border-x border-border hover:bg-muted/50 transition-colors"
                  onClick={() => { setInputValue(String(quantity)); setEditing(true); }}
                  aria-label="點擊輸入數量"
                >
                  {quantity}
                </button>
              )}
              <button
                onClick={() => onQuantityChange(quantity + 1)}
                className="w-12 h-12 flex items-center justify-center text-muted-foreground hover:bg-muted active:bg-accent transition-colors"
                aria-label="增加數量"
              >
                <PlusIcon className="size-5" />
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onAddToCart(); }}
              className="shrink-0 h-12 px-5 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center gap-1.5 active:scale-95 transition-transform"
              aria-label={`加入 ${item.name} × ${quantity}`}
            >
              <CheckIcon className="size-4" />
              加入
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
