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

/** Piece sizes as the UI prints them (FR-PRD-06). */
export const SIZES = ["93cm x 47cm", "100cm x 70cm", "50cm x 140cm", "100cm x 140cm"] as const;

/**
 * Fills what every new (roll) product needs: brand, a listed motif, the
 * first colour (Red), thickness (FR-PRD-06) and a normal and defect price
 * for each size (FR-ROL-02/05).
 */
export async function fillProductDetails(dialog: Locator, motif = "Nappa", piecePrice = "10000") {
  await choose(dialog, "Merk", E2E_BRAND);
  await pick(dialog, "Motif", motif);
  await pick(dialog, "Nama warna", "Red");
  await dialog.getByLabel("Ketebalan (mm)").fill("2");
  for (const size of SIZES) {
    await dialog.getByLabel(`Harga ${size}`).fill(piecePrice);
    await dialog.getByLabel(`Harga cacat ${size}`).fill("5000");
  }
}

/** Adds roll length through the stock page of a roll (FR-ROL-01). */
export async function receiveRoll(page: Page, sku: string, name: string, meters: string) {
  await page.goto(`/id/stock?q=${sku}`);
  await page.getByRole("link", { name: `Buka stok ${name} · Red · Roll`, exact: true }).click();
  await page.getByLabel("Panjang (m)").first().fill(meters);
  await page.getByRole("button", { name: "Tambah stok" }).click();
  await expectResult(page, "Stok diperbarui");
}

/** Cuts `meters` off a product's roll into `count` pieces of one size (FR-ROL-03). */
export async function cutPieces(
  page: Page,
  name: string,
  count: string,
  meters: string,
  size: string = SIZES[0],
) {
  await page.goto(`/id/cutting?q=${encodeURIComponent(name)}`);
  await page.getByRole("link", { name: `Potong ${name} · Red`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Potong ${name} · Red` });
  await dialog.getByLabel("Panjang dipotong (m)").fill(meters);
  await dialog.getByLabel(new RegExp(`^${size}`)).fill(count);
  await dialog.getByRole("button", { name: "Simpan potongan" }).click();
  await expectResult(page, "Potongan dicatat");
}

/**
 * Creates a roll product through the owner UI with `price` for every size,
 * 20 m of roll and `stock` pieces of 93cm x 47cm cut from 10 m of it.
 */
export async function createStockedProduct(
  page: Page,
  options: { name: string; sku: string; price: string; stock: string },
) {
  await page.goto("/id/products?new=1");
  await page.getByLabel("Nama produk").fill(options.name);
  await fillProductDetails(page.getByRole("dialog"), "Nappa", options.price);
  await page.getByLabel("Harga jual").fill(options.price);
  await page.getByLabel("SKU").fill(options.sku);
  await page.getByRole("button", { name: "Simpan produk" }).click();
  await expect(page).toHaveURL(/\/id\/products$/);
  await receiveRoll(page, options.sku, options.name, "20");
  await cutPieces(page, options.name, options.stock, "10");
}

/** Taps a product at the POS and picks one of its sizes (FR-ROL-04). */
export async function addPiece(page: Page, name: string, size: string = SIZES[0]) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page
    .getByRole("dialog", { name: "Pilih ukuran" })
    .getByRole("button", { name: new RegExp(`^${size}(?!\\s*Cacat)`) })
    .click();
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

/** Picks an option in a searchable dropdown (ADR-0026), typing `search` first. */
export async function pick(scope: Page | Locator, label: string, option: string, search = option) {
  const page = "page" in scope ? scope.page() : scope;
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("combobox", { name: "Cari…" }).fill(search);
  await page.getByRole("option", { name: option, exact: true }).click();
}
