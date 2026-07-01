import { describe, it, expect, vi } from "vitest";
import {
  isPageAllowed,
  pathnameToPageKey,
  hrefToPageKey,
  getEffectiveStorePrice,
  DEFAULT_PERMISSIONS,
  ALL_PAGES,
} from "@/lib/permissions";

describe("permissions", () => {
  describe("isPageAllowed", () => {
    it("should allow any page for wildcard", () => {
      expect(isPageAllowed(["*"], "dashboard")).toBe(true);
      expect(isPageAllowed(["*"], "settings")).toBe(true);
      expect(isPageAllowed(["*"], "anything")).toBe(true);
    });

    it("should allow listed pages", () => {
      expect(isPageAllowed(["dashboard", "orders"], "orders")).toBe(true);
    });

    it("should deny unlisted pages", () => {
      expect(isPageAllowed(["dashboard", "orders"], "settings")).toBe(false);
    });

    it("should deny for empty array", () => {
      expect(isPageAllowed([], "dashboard")).toBe(false);
    });
  });

  describe("pathnameToPageKey", () => {
    it("should match /dashboard exactly", () => {
      expect(pathnameToPageKey("/dashboard")).toBe("dashboard");
    });

    it("should match dashboard sub-routes", () => {
      expect(pathnameToPageKey("/dashboard/orders")).toBe("orders");
      expect(pathnameToPageKey("/dashboard/suppliers")).toBe("suppliers");
      expect(pathnameToPageKey("/dashboard/menu")).toBe("menu");
    });

    it("should match dashboard sub-routes with id", () => {
      expect(pathnameToPageKey("/dashboard/suppliers/42")).toBe("suppliers");
    });

    it("should match /order routes", () => {
      expect(pathnameToPageKey("/order")).toBe("order");
      expect(pathnameToPageKey("/order/receiving")).toBe("order");
    });

    it("should return null for unknown routes", () => {
      expect(pathnameToPageKey("/unknown")).toBeNull();
      expect(pathnameToPageKey("/")).toBeNull();
    });
  });

  describe("hrefToPageKey", () => {
    it("should map known hrefs to page keys", () => {
      expect(hrefToPageKey("/dashboard")).toBe("dashboard");
      expect(hrefToPageKey("/dashboard/orders")).toBe("orders");
      expect(hrefToPageKey("/order")).toBe("order");
    });

    it("should return null for unknown hrefs", () => {
      expect(hrefToPageKey("/unknown")).toBeNull();
    });
  });

  describe("getEffectiveStorePrice", () => {
    it("手動固定價 > 0 時直接用", () => {
      expect(getEffectiveStorePrice(100, 150)).toBe(150);
      // 有固定價時，加成 % 被忽略
      expect(getEffectiveStorePrice(100, 150, 50)).toBe(150);
    });

    it("store_price=0 時用預設加成 20%（= 舊 1.2）", () => {
      expect(getEffectiveStorePrice(100, 0)).toBe(120);
    });

    it("store_price=0 時用該品項自訂加成 %", () => {
      expect(getEffectiveStorePrice(100, 0, 30)).toBe(130);
      expect(getEffectiveStorePrice(100, 0, 0)).toBe(100); // 0% 加成 = 成本價
      expect(getEffectiveStorePrice(200, 0, 15)).toBe(230);
    });

    it("四捨五入到整數", () => {
      expect(getEffectiveStorePrice(33, 0, 30)).toBe(43); // 33 × 1.3 = 42.9 → 43
    });

    it("markupPct 非數字時 fallback 預設 20%", () => {
      expect(getEffectiveStorePrice(100, 0, NaN)).toBe(120);
    });
  });

  describe("DEFAULT_PERMISSIONS", () => {
    it("admin should have wildcard access", () => {
      expect(DEFAULT_PERMISSIONS.admin).toEqual(["*"]);
    });

    it("staff should only have order page", () => {
      expect(DEFAULT_PERMISSIONS.staff).toEqual(["order"]);
    });
  });

  describe("ALL_PAGES", () => {
    it("should have unique keys", () => {
      const keys = ALL_PAGES.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});
