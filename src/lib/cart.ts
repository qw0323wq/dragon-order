/**
 * 購物車相關型別和工具函式
 */

import type { MenuItem } from "./mock-data";

/** 購物車中的單一品項 */
export interface CartItem {
  item: MenuItem;
  quantity: number;
}

/** 計算購物車預估金額（進貨成本） */
export function calcCartTotal(cartItems: CartItem[]): number {
  return cartItems.reduce(
    (sum, ci) => sum + ci.item.cost_price * ci.quantity,
    0
  );
}

/** 計算購物車總品項數量（件數加總） */
export function calcCartCount(cartItems: CartItem[]): number {
  return cartItems.reduce((sum, ci) => sum + ci.quantity, 0);
}

/**
 * 加入或更新購物車品項
 * 若已存在則累加數量，否則新增
 */
export function addToCart(
  cart: CartItem[],
  item: MenuItem,
  quantity: number
): CartItem[] {
  const existing = cart.find((ci) => ci.item.id === item.id);
  if (existing) {
    return cart.map((ci) =>
      ci.item.id === item.id
        ? { ...ci, quantity: ci.quantity + quantity }
        : ci
    );
  }
  return [...cart, { item, quantity }];
}

/**
 * 更新購物車中某品項的數量
 * 若數量 <= 0 則移除
 */
export function updateCartQuantity(
  cart: CartItem[],
  itemId: number,
  quantity: number
): CartItem[] {
  if (quantity <= 0) {
    return cart.filter((ci) => ci.item.id !== itemId);
  }
  return cart.map((ci) =>
    ci.item.id === itemId ? { ...ci, quantity } : ci
  );
}

/** 從購物車移除品項 */
export function removeFromCart(cart: CartItem[], itemId: number): CartItem[] {
  return cart.filter((ci) => ci.item.id !== itemId);
}
