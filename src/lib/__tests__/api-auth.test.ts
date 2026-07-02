import { describe, it, expect } from "vitest";
import { normalizeRole, VALID_ROLES } from "@/lib/api-auth";

describe("normalizeRole（權限判斷的角色來源）", () => {
  it("四個正式角色原樣保留", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("buyer")).toBe("buyer");
    expect(normalizeRole("manager")).toBe("manager");
    expect(normalizeRole("staff")).toBe("staff");
  });

  it("owner 視為 admin（相容舊角色）", () => {
    expect(normalizeRole("owner")).toBe("admin");
  });

  it("未知/空值一律降到 staff（最保守，避免誤放權限）", () => {
    expect(normalizeRole(null)).toBe("staff");
    expect(normalizeRole(undefined)).toBe("staff");
    expect(normalizeRole("")).toBe("staff");
    expect(normalizeRole("superuser")).toBe("staff");
    expect(normalizeRole("ADMIN")).toBe("staff"); // 大小寫敏感，不誤放
  });

  it("回傳值一定在合法角色白名單內", () => {
    for (const raw of ["admin", "buyer", "manager", "staff", "owner", "x", ""]) {
      expect(VALID_ROLES).toContain(normalizeRole(raw));
    }
  });
});
