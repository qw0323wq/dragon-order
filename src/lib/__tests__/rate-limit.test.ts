import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("should allow requests within limit", () => {
    const opts = { key: "test-allow", limit: 3, windowMs: 60000 };
    expect(rateLimit(opts).allowed).toBe(true);
    expect(rateLimit(opts).allowed).toBe(true);
    expect(rateLimit(opts).allowed).toBe(true);
  });

  it("should block requests exceeding limit", () => {
    const opts = { key: "test-block", limit: 2, windowMs: 60000 };
    rateLimit(opts); // 1
    rateLimit(opts); // 2
    const result = rateLimit(opts); // 3 → blocked
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should track remaining count", () => {
    const opts = { key: "test-remaining", limit: 3, windowMs: 60000 };
    expect(rateLimit(opts).remaining).toBe(2);
    expect(rateLimit(opts).remaining).toBe(1);
    expect(rateLimit(opts).remaining).toBe(0);
  });

  it("should use different counters for different keys", () => {
    const opts1 = { key: "test-key-a", limit: 1, windowMs: 60000 };
    const opts2 = { key: "test-key-b", limit: 1, windowMs: 60000 };
    rateLimit(opts1);
    expect(rateLimit(opts1).allowed).toBe(false);
    expect(rateLimit(opts2).allowed).toBe(true);
  });
});
