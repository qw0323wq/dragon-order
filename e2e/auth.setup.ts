/**
 * E2E 登入 setup — 建立認證 state 供後續測試使用
 *
 * 登入 E001/1234（管理員），儲存 cookie 到 .auth/admin.json
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

const ADMIN_AUTH_FILE = path.join(__dirname, "../.auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/");

  // 填入員工編號和密碼
  await page.getByPlaceholder("員工編號").fill("E001");
  await page.getByPlaceholder("密碼").fill("1234");
  await page.getByRole("button", { name: "登入" }).click();

  // 等待登入成功（導向到 dashboard 或 order 頁）
  await expect(page).toHaveURL(/\/(dashboard|order)/, { timeout: 10_000 });

  // 儲存登入狀態
  await page.context().storageState({ path: ADMIN_AUTH_FILE });
});
