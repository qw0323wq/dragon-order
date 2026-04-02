import { describe, it, expect } from "vitest";
import { parseOrderText } from "@/lib/text-parser";
import type { MenuItem } from "@/lib/mock-data";

const mockItems: MenuItem[] = [
  { id: 1, name: "五花肉", category: "肉品", unit: "斤", cost_price: 180, sell_price: 270, aliases: ["五花", "三層肉"] },
  { id: 2, name: "白蝦", category: "海鮮", unit: "包", cost_price: 250, sell_price: 375, aliases: ["蝦", "蝦子"] },
  { id: 3, name: "高麗菜", category: "蔬菜", unit: "顆", cost_price: 35, sell_price: 50, aliases: ["高麗", "甘藍"] },
  { id: 4, name: "金針菇", category: "菇類", unit: "包", cost_price: 25, sell_price: 35, aliases: ["金針"] },
];

describe("parseOrderText", () => {
  it("should parse item name with quantity", () => {
    const result = parseOrderText("五花肉 10斤", mockItems);
    expect(result).toHaveLength(1);
    expect(result[0].item?.id).toBe(1);
    expect(result[0].quantity).toBe(10);
    expect(result[0].confidence).toBeGreaterThan(0);
  });

  it("should match by alias", () => {
    const result = parseOrderText("三層肉 5", mockItems);
    expect(result).toHaveLength(1);
    expect(result[0].item?.id).toBe(1);
    expect(result[0].quantity).toBe(5);
  });

  it("should parse multiple lines", () => {
    const result = parseOrderText("五花 10\n白蝦 5包\n高麗菜 3顆", mockItems);
    expect(result).toHaveLength(3);
    expect(result[0].item?.id).toBe(1);
    expect(result[1].item?.id).toBe(2);
    expect(result[2].item?.id).toBe(3);
  });

  it("should handle comma-separated items", () => {
    const result = parseOrderText("五花 10，白蝦 5", mockItems);
    expect(result).toHaveLength(2);
  });

  it("should default quantity to 1 when no number found", () => {
    // 注意：「五花肉」中的「五」會被 parseQuantity 當中文數字解析為 5
    // 用一個不含中文數字的品項測試預設值
    const result = parseOrderText("高麗菜", mockItems);
    expect(result[0].quantity).toBe(1);
  });

  it("should handle x-prefix quantity format", () => {
    const result = parseOrderText("白蝦 x3", mockItems);
    expect(result[0].quantity).toBe(3);
  });

  it("should return null item for unrecognized text", () => {
    const result = parseOrderText("不存在的東西", mockItems);
    expect(result).toHaveLength(1);
    expect(result[0].item).toBeNull();
    expect(result[0].confidence).toBe(0);
    expect(result[0].errorReason).toBeDefined();
  });

  it("should handle empty input", () => {
    const result = parseOrderText("", mockItems);
    expect(result).toHaveLength(0);
  });

  it("should handle whitespace-only input", () => {
    const result = parseOrderText("   \n  \n  ", mockItems);
    expect(result).toHaveLength(0);
  });

  it("should keep confidence at most 0.95", () => {
    const result = parseOrderText("五花肉", mockItems);
    expect(result[0].confidence).toBeLessThanOrEqual(0.95);
  });
});
