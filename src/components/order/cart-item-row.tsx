"use client";

import { useState } from "react";
import type { CartItem } from "@/lib/cart";
import { PlusIcon, MinusIcon, TrashIcon, Undo2Icon } from "lucide-react";

interface CartItemRowProps {
  cartItem: CartItem;
  showPrice: boolean;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
}

export function CartItemRow({ cartItem, showPrice, onQuantityChange, onRemove }: CartItemRowProps) {
  const { item, quantity } = cartItem;
  const subtotal = item.cost_price * quantity;
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDelete() {
    if (confirmDelete) {
      onRemove();
    } else {
      setConfirmDelete(true);
      // 3 秒後自動取消確認狀態
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-foreground truncate">{item.name}</div>
        <div className="text-sm text-muted-foreground">
          {showPrice ? `$${item.cost_price}/${item.unit} · 小計 $${subtotal}` : `${quantity} ${item.unit}`}
        </div>
      </div>

      {/* 數量控制：加大觸控目標到 44px */}
      <div className="flex items-center border border-border rounded-xl overflow-hidden shrink-0">
        <button onClick={() => onQuantityChange(quantity - 1)}
          className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:bg-muted active:bg-accent"
          aria-label="減少">
          <MinusIcon className="size-5" />
        </button>
        <span className="w-11 text-center text-base font-bold">{quantity}</span>
        <button onClick={() => onQuantityChange(quantity + 1)}
          className="w-11 h-11 flex items-center justify-center text-muted-foreground hover:bg-muted active:bg-accent"
          aria-label="增加">
          <PlusIcon className="size-5" />
        </button>
      </div>

      {/* 刪除：需要點兩次確認 */}
      <button onClick={handleDelete}
        className={`w-11 h-11 flex items-center justify-center rounded-xl transition-colors shrink-0 ${
          confirmDelete
            ? 'bg-red-500 text-white animate-pulse'
            : 'text-red-400 hover:text-red-600 hover:bg-red-50'
        }`}
        aria-label={confirmDelete ? `確認移除 ${item.name}` : `移除 ${item.name}`}>
        <TrashIcon className="size-5" />
      </button>
    </div>
  );
}
