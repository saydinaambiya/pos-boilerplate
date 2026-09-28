import { existsSync } from "node:fs";

import type { Browser, Locator, Page } from "@playwright/test";

import { accounts, E2E_BRAND } from "./accounts";
import { expect } from "./fixtures";

const POS_CASHIER_STATE = "playwright/.auth/pos-cashier.json";

/**
 * Opens the dedicated POS cashier in a fresh context and makes sure a shift
 * is open. The session is saved and reused across specs, so parallel specs
 * stay under the device limit (FR-AUTH-09); it signs in again only when the
 * saved session is missing or expired.
 */
export async function cashierAtPos(browser: Browser): Promise<Page> {
  let context = await browser.newContext({
    storageState: existsSync(POS_CASHIER_STATE) ? POS_CASHIER_STATE : { cookies: [], origins: [] },
  });
  let page = await context.newPage();
  await page.goto("/id/pos");
  if (new URL(page.url()).pathname.endsWith("/login")) {
    await context.close();
    context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    page = await context.newPage();
    await page.goto("/id/login");
    await page.getByLabel("Username").fill(accounts.posCashier.username);
    await page.getByRole("button", { name: "Lanjut" }).click();
    await page.getByLabel(/^(Password|PIN)$/).fill(accounts.posCashier.pin);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/id$/);
    await context.storageState({ path: POS_CASHIER_STATE });
    await page.goto("/id/pos");
  }
  const openShift = page.getByRole("button", { name: "Buka shift" });
  if (await openShift.isVisible()) {
    await page.getByLabel("Modal awal kas").fill("100000");
    await openShift.click();
  }
  await expect(page.getByRole("searchbox", { name: "Cari produk" })).toBeVisible();
  return page;
}

/** Fills the brand, motif and size every new product needs (FR-PRD-06). */
export async function fillProductDetails(dialog: Locator, motif = "Polos") {
  await choose(dialog, "Merk", E2E_BRAND);
  await dialog.getByLabel("Motif").fill(motif);
  await choose(dialog, "Ukuran", "93 × 47 cm");
}

/** Creates a stock-tracked product through the owner UI. */
export async function createStockedProduct(
  page: Page,
  options: { name: string; sku: string; price: string; stock: string },
) {
  await page.goto("/id/products?new=1");
  await page.getByLabel("Nama produk").fill(options.name);
  await fillProductDetails(page.getByRole("dialog"));
  await page.getByLabel("Harga jual").fill(options.price);
  await page.getByLabel("SKU").fill(options.sku);
  await page.getByRole("button", { name: "Simpan produk" }).click();
  await expect(page).toHaveURL(/\/id\/products$/);

  await page.goto(`/id/stock?q=${options.sku}`);
  await page.getByRole("link", { name: `Buka stok ${options.name}` }).click();
  await page.getByLabel("Jumlah").first().fill(options.stock);
  await page.getByRole("button", { name: "Tambah stok" }).click();
  await expectResult(page, "Stok diperbarui");
}

/** Ensures the default employee role holds a permission (checkbox in the role matrix). */
export async function grantEmployeePermission(page: Page, label: string) {
  await page.goto("/id/employees/roles");
  await page.getByRole("link", { name: "Ubah Karyawan" }).click();
  const box = page.getByLabel(label);
  if (!(await box.isChecked())) {
    await box.check();
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expectResult(page, "Role disimpan.");
  }
}

/** Checks the action result dialog (FR-UX-05) and closes it with OK. */
export async function expectResult(
  page: Page,
  text: string | RegExp,
  status: "success" | "error" = "success",
) {
  const dialog = page.getByRole("dialog", { name: status === "success" ? "Berhasil" : "Gagal" });
  await expect(dialog).toContainText(text);
  await dialog.getByRole("button", { name: "Oke" }).click();
  await expect(dialog).toBeHidden();
}

/** Picks an option in a design-system dropdown (FR-UI-01) by its label. */
export async function choose(scope: Page | Locator, label: string, option: string) {
  const page = "page" in scope ? scope.page() : scope;
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
