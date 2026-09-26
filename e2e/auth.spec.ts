import type { Page } from "@playwright/test";

import { accounts } from "./accounts";
import { expect, test } from "./fixtures";

async function signIn(page: Page, username: string, secret: string) {
  await page.goto("/id/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password atau PIN").fill(secret);
  await page.getByRole("button", { name: "Masuk" }).click();
}

const mainNavigation = (page: Page) =>
  page.getByRole("navigation", { name: "Navigasi utama" }).filter({ visible: true });

test.describe("authentication (FR-AUTH, FR-RBAC)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sends anonymous visitors to the login page", async ({ page }) => {
    await page.goto("/id/products");
    await expect(page).toHaveURL(/\/id\/login$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Masuk");
  });

  test.describe("account flows", () => {
    test.skip(({ isMobile }) => isMobile, "stateful account flows run once, on desktop");

    test("signs the owner in and out", async ({ page }) => {
      await signIn(page, accounts.owner.username, accounts.owner.password);
      await expect(page).toHaveURL(/\/id$/);
      await expect(mainNavigation(page).getByRole("link", { name: "Pengaturan" })).toBeVisible();

      await page.getByRole("button", { name: "Keluar" }).first().click();
      await expect(page).toHaveURL(/\/id\/login$/);
      await page.goto("/id");
      await expect(page).toHaveURL(/\/id\/login$/);
    });

    test("rejects a wrong PIN with a generic message and focuses the field", async ({ page }) => {
      await signIn(page, accounts.cashier.username, "000000");
      await expect(page.locator("form").getByRole("alert")).toHaveText(
        "Username atau password/PIN salah.",
      );
      await expect(page.getByLabel("Password atau PIN")).toBeFocused();
      await expect(page.getByLabel("Username")).toHaveValue(accounts.cashier.username);
    });

    test("locks the account after five failed attempts", async ({ page }) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await signIn(page, accounts.lockedCashier.username, "000000");
        await expect(page.locator("form").getByRole("alert")).toBeVisible();
      }
      await expect(page.locator("form").getByRole("alert")).toContainText(
        "Akun terkunci sementara",
      );
    });

    test("forces a PIN change, then applies the role's permissions", async ({ page }) => {
      await signIn(page, accounts.newCashier.username, accounts.newCashier.pin);
      await expect(page).toHaveURL(/\/id\/change-pin$/);

      await page.getByLabel("PIN baru", { exact: true }).fill("246810");
      await page.getByLabel("Ulangi PIN baru").fill("246811");
      await page.getByRole("button", { name: "Simpan PIN" }).click();
      await expect(page.getByText("PIN tidak sama.")).toBeVisible();

      await page.getByLabel("PIN baru", { exact: true }).fill("246810");
      await page.getByLabel("Ulangi PIN baru").fill("246810");
      await page.getByRole("button", { name: "Simpan PIN" }).click();
      await expect(page).toHaveURL(/\/id$/);

      await expect(mainNavigation(page).getByRole("link", { name: "Kasir" })).toBeVisible();
      await expect(mainNavigation(page).getByRole("link", { name: "Pengaturan" })).toHaveCount(0);

      const response = await page.goto("/id/settings");
      expect(response?.status()).toBe(403);
      await expect(page.getByText("Akses ditolak")).toBeVisible();
    });
  });
});
