import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF 產生（/api/purchase-orders/[id]/pdf）用的 native binary，不能被 bundler 打包
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // CRITICAL: chromium 的 bin/*.br 是 runtime fs 讀取，file tracing 追不到，
  // 不強制 include 的話 lambda 上會噴 "bin does not exist"（2026-07-17 踩坑）
  outputFileTracingIncludes: {
    // CRITICAL: key 是 picomatch glob —— [id] 會被當字元類，必須 escape 或用 **。
    // 兩個 key 雙保險，效果相同：只有 PDF route 會夾帶 chromium bin（~80MB）。
    "/api/purchase-orders/\\[id\\]/pdf/route": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/purchase-orders/**/pdf/route": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
};

export default nextConfig;
