import { describe, it, expect } from "vitest";
import {
  addToCart,
  updateCartQuantity,
  removeFromCart,
  calcCartTotal,
  calcCartCount,
  type CartItem,
} from "@/lib/cart";
import type { MenuItem } from "@/lib/mock-data";

const mockItem = (id: number, price: number): MenuItem => ({
  id,
  name: `Item ${id}`,
  category: "肉品",
  unit: "斤",
  cost_price: price,
  sell_price: price * 1.5,
  aliases: [],
});

const item1 = mockItem(1, 100);
const item2 = mockItem(2, 200);

describe("cart", () => {
  describe("addToCart", () => {
    it("should add new item to empty cart", () => {
      const result = addToCart([], item1, 3);
      expect(result).toHaveLength(1);
      expect(result[0].item.id).toBe(1);
      expect(result[0].quantity).toBe(3);
    });

    it("should accumulate quantity for existing item", () => {
      const cart: CartItem[] = [{ item: item1, quantity: 2 }];
      const result = addToCart(cart, item1, 3);
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(5);
    });

    it("should not mutate original cart", () => {
      const cart: CartItem[] = [{ item: item1, quantity: 2 }];
      const result = addToCart(cart, item2, 1);
      expect(cart).toHaveLength(1);
      expect(result).toHaveLength(2);
    });
  });

  describe("updateCartQuantity", () => {
    it("should update quantity of existing item", () => {
      const cart: CartItem[] = [{ item: item1, quantity: 2 }];
      const result = updateCartQuantity(cart, 1, 5);
      expect(result[0].quantity).toBe(5);
    });

    it("should remove item when quantity <= 0", () => {
      const cart: CartItem[] = [{ item: item1, quantity: 2 }];
      const result = updateCartQuantity(cart, 1, 0);
      expect(result).toHaveLength(0);
    });

    it("should remove item when quantity is negative", () => {
      const cart: CartItem[] = [{ item: item1, quantity: 2 }];
      const result = updateCartQuantity(cart, 1, -1);
      expect(result).toHaveLength(0);
    });
  });

  describe("removeFromCart", () => {
    it("should remove specified item", () => {
      const cart: CartItem[] = [
        { item: item1, quantity: 2 },
        { item: item2, quantity: 1 },
      ];
      const result = removeFromCart(cart, 1);
      expect(result).toHaveLength(1);
      expect(result[0].item.id).toBe(2);
    });

    it("should return same array if item not found", () => {
      const cart: CartItem[] = [{ item: item1, quantity: 2 }];
      const result = removeFromCart(cart, 999);
      expect(result).toHaveLength(1);
    });
  });

  describe("calcCartTotal", () => {
    it("should calculate total cost", () => {
      const cart: CartItem[] = [
        { item: item1, quantity: 2 }, // 100 * 2 = 200
        { item: item2, quantity: 3 }, // 200 * 3 = 600
      ];
      expect(calcCartTotal(cart)).toBe(800);
    });

    it("should return 0 for empty cart", () => {
      expect(calcCartTotal([])).toBe(0);
    });
  });

  describe("calcCartCount", () => {
    it("should sum all quantities", () => {
      const cart: CartItem[] = [
        { item: item1, quantity: 2 },
        { item: item2, quantity: 3 },
      ];
      expect(calcCartCount(cart)).toBe(5);
    });

    it("should return 0 for empty cart", () => {
      expect(calcCartCount([])).toBe(0);
    });
  });
});
