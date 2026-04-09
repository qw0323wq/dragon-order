/**
 * E2E：後台儀表板基本檢查
 */
import { test, expect } from "@playwright/test";
import path from "path";

const ADMIN_AUTH = path.join(__dirname, "../.auth/admin.json");

test.use({ storageState: ADMIN_AUTH });

test.describe("後台儀表板", () => {
  test("儀表板頁面載入", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("儀表板")).toBeVisible({ timeout: 10_000 });
    // 統計卡片應該存在
    await expect(page.getByText("本月採購額")).toBeVisible();
  });

  test("供應商頁面載入", async ({ page }) => {
    await page.goto("/dashboard/suppliers");
    await expect(page.getByText("供應商")).toBeVisible({ timeout: 10_000 });
  });

  test("品項管理頁面載入", async ({ page }) => {
    await page.goto("/dashboard/menu");
    await expect(page.getByText("品項")).toBeVisible({ timeout: 10_000 });
  });

  test("報表中心頁面載入", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await expect(page.getByText("營運報表")).toBeVisible({ timeout: 10_000 });
    // tab 應該存在
    await expect(page.getByText("叫貨建議")).toBeVisible();
  });
});
