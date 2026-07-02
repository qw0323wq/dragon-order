import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // 測試用假密鑰 — session.ts 載入時要求 JWT_SECRET，否則 import 就 throw
    env: {
      JWT_SECRET: "test-secret-not-used-in-prod",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
