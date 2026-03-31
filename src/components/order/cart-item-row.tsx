"use client";

import type { CartItem } from "@/lib/cart";
import { PlusIcon, MinusIcon, TrashIcon } from "lucide-react";

interface CartItemRowProps {
  cartItem: CartItem;
  showPrice: boolean;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
}

export function CartItemRow({ cartItem, showPrice, onQuantityChange, onRemove }: CartItemRowProps) {
  const { item, quantity } = cartItem;
  const subtotal = item.cost_price * quantity;

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-base font-semibold text-foreground truncate">{item.name}</div>
        <div className="text-sm text-muted-foreground">
          {showPrice ? `$${item.cost_price}/${item.unit} · 小計 $${subtotal}` : `${quantity} ${item.unit}`}
        </div>
      </div>

      <div className="flex items-center border border-border rounded-xl overflow-hidden shrink-0">
        <button onClick={() => onQuantityChange(quantity - 1)}
          className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:bg-muted active:bg-accent"
          aria-label="減少">
          <MinusIcon className="size-4" />
        </button>
        <span className="w-10 text-center text-base font-bold">{quantity}</span>
        <button onClick={() => onQuantityChange(quantity + 1)}
          className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:bg-muted active:bg-accent"
          aria-label="增加">
          <PlusIcon className="size-4" />
        </button>
      </div>

      <button onClick={onRemove}
        className="w-10 h-10 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0"
        aria-label={`移除 ${item.name}`}>
        <TrashIcon className="size-5" />
      </button>
    </div>
  );
}
