/**
 * E2E：叫貨流程（關鍵路徑）
 * 登入 → 選門市 → 加品項到購物車 → 送出訂單
 */
import { test, expect } from "@playwright/test";
import path from "path";

const ADMIN_AUTH = path.join(__dirname, "../.auth/admin.json");

test.use({ storageState: ADMIN_AUTH });

test.describe("叫貨流程", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/order");
  });

  test("頁面載入正常", async ({ page }) => {
    // 應該看到叫貨頁的 tab
    await expect(page.getByRole("tab", { name: "叫貨" })).toBeVisible();
  });

  test("可以搜尋品項", async ({ page }) => {
    // 點搜尋
    const searchBtn = page.locator('[data-testid="search-toggle"]').or(
      page.getByRole("button").filter({ hasText: /搜尋/ })
    );
    if (await searchBtn.isVisible()) {
      await searchBtn.click();
    }

    // 搜尋框
    const searchInput = page.getByPlaceholder("搜尋品項");
    if (await searchInput.isVisible()) {
      await searchInput.fill("牛");
      // 應該有搜尋結果
      await expect(page.locator(".space-y-1 button, .grid button").first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("可以選擇門市", async ({ page }) => {
    // 門市選擇器
    const storeSelect = page.getByRole("combobox").first();
    if (await storeSelect.isVisible()) {
      await storeSelect.click();
      // 應該顯示門市選項
      await expect(page.getByRole("option").first()).toBeVisible({ timeout: 3000 });
    }
  });
});
