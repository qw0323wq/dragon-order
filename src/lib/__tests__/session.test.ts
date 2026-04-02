import { describe, it, expect, vi, beforeEach } from "vitest";

// 設定必要的環境變數
vi.stubEnv("JWT_SECRET", "test-secret-for-vitest");

// 動態 import 確保環境變數已設定
const { signSession, verifySession } = await import("@/lib/session");

describe("session", () => {
  describe("signSession", () => {
    it("should return base64.signature format", () => {
      const token = signSession({ id: 1, role: "admin" });
      const parts = token.split(".");
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    });

    it("should produce different signatures for different data", () => {
      const token1 = signSession({ id: 1 });
      const token2 = signSession({ id: 2 });
      expect(token1).not.toBe(token2);
    });

    it("should produce same signature for same data", () => {
      const token1 = signSession({ id: 1, name: "test" });
      const token2 = signSession({ id: 1, name: "test" });
      expect(token1).toBe(token2);
    });
  });

  describe("verifySession", () => {
    it("should return original data for valid token", () => {
      const data = { id: 1, name: "Terry", role: "admin" };
      const token = signSession(data);
      const result = verifySession(token);
      expect(result).toEqual(data);
    });

    it("should return null for tampered payload", () => {
      const token = signSession({ id: 1, role: "staff" });
      const [, sig] = token.split(".");
      // 替換 payload 但保留原 signature
      const fakePayload = Buffer.from(JSON.stringify({ id: 1, role: "admin" })).toString("base64url");
      const tampered = `${fakePayload}.${sig}`;
      expect(verifySession(tampered)).toBeNull();
    });

    it("should return null for tampered signature", () => {
      const token = signSession({ id: 1 });
      const [payload] = token.split(".");
      const tampered = `${payload}.fakesignature`;
      expect(verifySession(tampered)).toBeNull();
    });

    it("should return null for invalid format (no dot)", () => {
      expect(verifySession("nodothere")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(verifySession("")).toBeNull();
    });

    it("should return null for too many dots", () => {
      expect(verifySession("a.b.c")).toBeNull();
    });

    it("should return null for invalid base64 payload", () => {
      const token = signSession({ id: 1 });
      const [, sig] = token.split(".");
      expect(verifySession(`!!!invalid!!!.${sig}`)).toBeNull();
    });
  });
});
