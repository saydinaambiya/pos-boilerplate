import { gzipSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";

import { accounts } from "./accounts";
import { expect, test } from "./fixtures";
import { choose, expectResult } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Teh ${run}`;
const sku = `TEH-${run}`.toUpperCase();

const rupiah = (amount: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
    .format(amount)
    .replace(/\s/g, "\u00a0");

/** Grand total shown in the cart; taxes depend on shared settings, so it is read, not assumed. */
async function cartTotal(page: Page): Promise<number> {
  const text = await page.getByRole("complementary", { name: "Keranjang" }).innerText();
  const match = /Total\s*Rp\s*([\d.]+)/.exec(text);
  return Number((match?.[1] ?? "").replaceAll(".", ""));
}

/** Signs in the dedicated POS cashier and makes sure a shift is open. */
async function cashierAtPos(browser: Browser): Promise<Page> {
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

test.describe("POS terminal and checkout (FR-POS, FR-PAY)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful POS flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares a product with stock", async ({ page }) => {
    await page.goto("/id/products/categories");
    await page.getByLabel("Nama kategori").fill(`Minuman POS ${run}`);
    await page.getByRole("button", { name: "Tambah kategori" }).click();
    await expectResult(page, "Kategori disimpan.");

    await page.goto("/id/products/new");
    await page.getByLabel("Nama produk").fill(product);
    await choose(page, "Kategori", `Minuman POS ${run}`);
    await page.getByLabel("Harga jual").fill("8000");
    await page.getByLabel("SKU").fill(sku);
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page).toHaveURL(/\/id\/products$/);

    await page.goto(`/id/stock?q=${sku}`);
    await page.getByRole("link", { name: `Buka stok ${product}` }).click();
    await page.getByLabel("Jumlah").first().fill("10");
    await page.getByRole("button", { name: "Tambah stok" }).click();
    await expectResult(page, "Stok diperbarui: +10 → 10.");
  });

  test("sells with cash, keeps the cart across reloads and shows the change", async ({
    browser,
  }) => {
    const page = await cashierAtPos(browser);
    const cart = page.getByRole("complementary", { name: "Keranjang" });

    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Cari produk" })).toBeFocused();
    await page.keyboard.type(product);
    await page.getByRole("button", { name: new RegExp(product) }).click();
    await cart.getByRole("button", { name: `Tambah ${product}` }).click();
    await cart.getByRole("button", { name: `Tambah ${product}` }).click();
    await expect(cart.getByLabel(`Jumlah ${product}`)).toHaveValue("3");
    await expect(cart).toContainText(/Rp\s8\.000 × 3\s*Rp\s24\.000/);
    const total = await cartTotal(page);
    expect(total).toBeGreaterThanOrEqual(24_000);

    await page.reload();
    await expect(
      page.getByRole("complementary", { name: "Keranjang" }).getByLabel(`Jumlah ${product}`),
    ).toHaveValue("3");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.keyboard.press("F2");
    const dialog = page.getByRole("dialog", { name: "Pembayaran" });
    await expect(dialog).toContainText(rupiah(total));
    await dialog.getByLabel("Uang diterima").fill("20.000");
    await expect(dialog.getByText(`Kurang ${rupiah(total - 20_000)}`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Selesaikan transaksi" })).toBeDisabled();
    await dialog.getByLabel("Uang diterima").fill("100.000");
    await expect(dialog.getByText(`Kembalian: ${rupiah(100_000 - total)}`)).toBeVisible();
    await dialog.getByRole("button", { name: "Selesaikan transaksi" }).click();

    const success = page.getByRole("dialog", { name: "Transaksi berhasil" });
    await expect(success).toContainText(/Nomor invoice INV-\d{8}-\d{4}/);
    await expect(success).toContainText(`Kembalian: ${rupiah(100_000 - total)}`);
    await success.getByRole("link", { name: "Cetak struk" }).click();
    await expect(page).toHaveURL(/\/id\/print\/invoices\/[0-9a-f-]+\?print=1&tendered=100000$/);
    await expect(page.getByTestId("invoice")).toContainText("Kembalian");
    await expect(page.getByTestId("invoice")).toContainText(rupiah(100_000 - total));
    await expect(page.getByTestId("invoice")).toContainText("Tunai diterima");
    const saleId = /invoices\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? "";
    await page.goto(`/id/pos/sales/${saleId}`);
    await expect(page).toHaveURL(/\/id\/pos\/sales\/[0-9a-f-]+$/);
    await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText(/Rp\s24\.000/);

    await page.goto("/id/pos");
    await expect(page.getByRole("complementary", { name: "Keranjang" })).toContainText(
      "Keranjang kosong",
    );
    await page.context().close();
  });

  test("clears the cart with Esc after confirmation", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.getByRole("searchbox", { name: "Cari produk" }).fill(product);
    await page.getByRole("button", { name: new RegExp(product) }).click();
    await expect(
      page.getByRole("complementary", { name: "Keranjang" }).getByLabel(`Jumlah ${product}`),
    ).toHaveValue("1");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("dialog", { name: "Kosongkan keranjang?" });
    await confirm.getByRole("button", { name: "Kosongkan" }).click();
    await expect(page.getByRole("complementary", { name: "Keranjang" })).toContainText(
      "Keranjang kosong",
    );
    await page.context().close();
  });

  test("ships at most 280 KB of JavaScript on the terminal (NFR-PERF-02)", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    const sources = await page
      .locator("script[src]")
      .evaluateAll((scripts) => scripts.map((script) => script.getAttribute("src") ?? ""));
    const sizes = await Promise.all(
      sources.map(async (src) => gzipSync(await (await page.request.get(src)).body()).byteLength),
    );
    const total = sizes.reduce((sum, size) => sum + size, 0);
    test.info().annotations.push({ type: "js-gzip-bytes", description: String(total) });
    expect(total).toBeLessThanOrEqual(280 * 1024);
    await page.context().close();
  });

  test("deducted the sold quantity from stock", async ({ page }) => {
    await page.goto(`/id/stock?q=${sku}`);
    await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText("7");
  });
});
