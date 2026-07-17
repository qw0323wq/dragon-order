import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF 產生（/api/purchase-orders/[id]/pdf）用的 native binary，不能被 bundler 打包
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
