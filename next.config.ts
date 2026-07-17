import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF 產生（/api/purchase-orders/[id]/pdf）用的 native binary，不能被 bundler 打包
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // CRITICAL: chromium 的 bin/*.br 是 runtime fs 讀取，file tracing 追不到，
  // 不強制 include 的話 lambda 上會噴 "bin does not exist"（2026-07-17 踩坑）
  outputFileTracingIncludes: {
    "/api/purchase-orders/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
