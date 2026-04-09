/**
 * 結構化日誌 — 替代 console.error
 *
 * Vercel Serverless 環境下，pino 輸出 JSON 到 stdout，
 * 可被 Vercel Log Drain、Datadog、Sentry 等收集。
 *
 * CRITICAL: 所有 API route 的錯誤日誌改用此模組，不要直接 console.error
 */
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Vercel 環境用 JSON 格式，本地開發用可讀格式
  ...(process.env.NODE_ENV === "production"
    ? {}
    : {
        transport: {
          target: "pino/file",
          options: { destination: 1 }, // stdout
        },
      }),
});

/** 為特定模組建立子 logger */
export function createLogger(module: string) {
  return logger.child({ module });
}
