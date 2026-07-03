import { describe, it, expect } from "vitest";
import { unitToGrams, resolveUnitFactor, parseQuantity } from "../bom-cost";

describe("parseQuantity", () => {
  it("拆出數值 + 單位", () => {
    expect(parseQuantity("150g")).toEqual({ value: 150, unit: "g" });
    expect(parseQuantity("5顆")).toEqual({ value: 5, unit: "顆" });
    expect(parseQuantity("1整包")).toEqual({ value: 1, unit: "整包" });
    expect(parseQuantity("0.5斤")).toEqual({ value: 0.5, unit: "斤" });
  });
  it("帶雜訊字尾保留在單位", () => {
    expect(parseQuantity("120g(2小包)")).toEqual({ value: 120, unit: "g(2小包)" });
  });
  it("範圍取平均", () => {
    expect(parseQuantity("2~2.5個")).toEqual({ value: 2.25, unit: "個" });
    expect(parseQuantity("120~150g")).toEqual({ value: 135, unit: "g" });
  });
  it("純文字（適量/混搭）→ 無數值", () => {
    expect(parseQuantity("適量")).toEqual({ value: null, unit: null });
    expect(parseQuantity("混搭")).toEqual({ value: null, unit: null });
    expect(parseQuantity("")).toEqual({ value: null, unit: null });
    expect(parseQuantity(null)).toEqual({ value: null, unit: null });
  });
});

describe("unitToGrams", () => {
  it("認得重量單位（台灣慣例）", () => {
    expect(unitToGrams("g")).toBe(1);
    expect(unitToGrams("公克")).toBe(1);
    expect(unitToGrams("公斤")).toBe(1000);
    expect(unitToGrams("kg")).toBe(1000);
    expect(unitToGrams("台斤")).toBe(600);
    expect(unitToGrams("斤")).toBe(600); // 台灣 斤=台斤=600g（非大陸 500g）
    expect(unitToGrams("兩")).toBe(37.5);
  });

  it("容忍帶雜訊字尾的用量單位", () => {
    expect(unitToGrams("g(2小包)")).toBe(1);
    expect(unitToGrams("g~150g")).toBe(1);
    expect(unitToGrams("g(約6朵)")).toBe(1);
  });

  it("非重量單位回 null", () => {
    for (const u of ["瓶", "顆", "包", "件", "盒", "片", "塊", "支", "根", "碗", "杯", "罐", ""])
      expect(unitToGrams(u)).toBeNull();
    expect(unitToGrams(null)).toBeNull();
    expect(unitToGrams(undefined)).toBeNull();
  });
});

describe("resolveUnitFactor", () => {
  it("重量↔重量用公克比例換算（修好爆表的核心）", () => {
    // 巴沙魚 150g，SKU $90/公斤 → 150/1000 = 0.15
    expect(resolveUnitFactor("g", "公斤", null)).toEqual({ factor: 0.001, kind: "weight" });
    // g → 台斤 = 1/600
    expect(resolveUnitFactor("g", "台斤", null)).toEqual({ factor: 1 / 600, kind: "weight" });
    // 台斤 → 公斤 = 0.6
    expect(resolveUnitFactor("台斤", "公斤", null).factor).toBeCloseTo(0.6, 10);
  });

  it("同重量單位 → 係數 1 (match)", () => {
    expect(resolveUnitFactor("公斤", "公斤", null)).toEqual({ factor: 1, kind: "match" });
    expect(resolveUnitFactor("g", "g", null)).toEqual({ factor: 1, kind: "match" });
  });

  it("同字串非重量單位 → 係數 1（瓶→瓶、顆→顆）", () => {
    expect(resolveUnitFactor("瓶", "瓶", null)).toEqual({ factor: 1, kind: "match" });
    expect(resolveUnitFactor("顆", "顆", null)).toEqual({ factor: 1, kind: "match" });
  });

  it("BOM 空單位 → 係數 1（飲料 '1瓶' 既有正確行為）", () => {
    expect(resolveUnitFactor(null, "瓶", null)).toEqual({ factor: 1, kind: "match" });
    expect(resolveUnitFactor("", "杯", null)).toEqual({ factor: 1, kind: "match" });
  });

  it("跨維度有 cost_factor → 用人工係數 (manual)", () => {
    // 貢丸 5顆，1包=100顆 → factor 0.01；成本 5 × 0.01 × $650 = $32.5
    expect(resolveUnitFactor("顆", "包/3kg", 0.01)).toEqual({ factor: 0.01, kind: "manual" });
    // 酥肉 80g，1件=7500g → factor 1/7500
    expect(resolveUnitFactor("g", "件", 1 / 7500).kind).toBe("manual");
  });

  it("跨維度沒 cost_factor → mismatch（factor 0，呼叫端排除成本）", () => {
    expect(resolveUnitFactor("顆", "包", null)).toEqual({ factor: 0, kind: "mismatch" });
    expect(resolveUnitFactor("片", "塊", null)).toEqual({ factor: 0, kind: "mismatch" });
    expect(resolveUnitFactor("g", "包", null)).toEqual({ factor: 0, kind: "mismatch" });
    expect(resolveUnitFactor("g", "包", 0)).toEqual({ factor: 0, kind: "mismatch" }); // 0/負數不算有效係數
  });

  it("重量比例優先於 cost_factor（避免既有重量行被誤填係數污染）", () => {
    // 就算誤填了 cost_factor，重量↔重量仍走公克比例
    expect(resolveUnitFactor("g", "公斤", 999)).toEqual({ factor: 0.001, kind: "weight" });
  });
});
