import type { Browser, Page } from "@playwright/test";

import { accounts } from "./accounts";
import { expect } from "./fixtures";

/** Signs the dedicated POS cashier in a fresh context and makes sure a shift is open. */
export async function cashierAtPos(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/id/login");
  await page.getByLabel("Username").fill(accounts.posCashier.username);
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByLabel(/^(Password|PIN)$/).fill(accounts.posCashier.pin);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/id$/);
  await page.goto("/id/pos");
  const openShift = page.getByRole("button", { name: "Buka shift" });
  if (await openShift.isVisible()) {
    await page.getByLabel("Modal awal kas").fill("100000");
    await openShift.click();
  }
  await expect(page.getByRole("searchbox", { name: "Cari produk" })).toBeVisible();
  return page;
}

/** Creates a category and a stock-tracked product through the owner UI. */
export async function createStockedProduct(
  page: Page,
  options: { category: string; name: string; sku: string; price: string; stock: string },
) {
  await page.goto("/id/products/categories");
  await page.getByLabel("Nama kategori").fill(options.category);
  await page.getByRole("button", { name: "Tambah kategori" }).click();
  await expect(page.getByRole("status")).toHaveText("Kategori disimpan.");

  await page.goto("/id/products/new");
  await page.getByLabel("Nama produk").fill(options.name);
  await page.getByLabel("Kategori").selectOption({ label: options.category });
  await page.getByLabel("Harga jual").fill(options.price);
  await page.getByLabel("SKU").fill(options.sku);
  await page.getByRole("button", { name: "Simpan produk" }).click();
  await expect(page).toHaveURL(/\/id\/products$/);

  await page.goto(`/id/stock?q=${options.sku}`);
  await page.getByRole("link", { name: `Buka stok ${options.name}` }).click();
  await page.getByLabel("Jumlah").first().fill(options.stock);
  await page.getByRole("button", { name: "Tambah stok" }).click();
  await expect(page.getByRole("status")).toContainText("Stok diperbarui");
}

/** Ensures the default employee role holds a permission (checkbox in the role matrix). */
export async function grantEmployeePermission(page: Page, label: string) {
  await page.goto("/id/employees/roles");
  await page.getByRole("link", { name: "Ubah Karyawan" }).click();
  const box = page.getByLabel(label);
  if (!(await box.isChecked())) {
    await box.check();
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByRole("status")).toHaveText("Role disimpan.");
  }
}
