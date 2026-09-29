import { gzipSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { addPiece, cashierAtPos, choose, createStockedProduct, expectResult } from "./helpers";

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

test.describe("POS terminal and checkout (FR-POS, FR-PAY)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful POS flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares a roll product with cut pieces", async ({ page }) => {
    await createStockedProduct(page, { name: product, sku, price: "8000", stock: "10" });
  });

  test("sells with cash, keeps the cart across reloads and shows the change", async ({
    browser,
  }) => {
    const page = await cashierAtPos(browser);
    const cart = page.getByRole("complementary", { name: "Keranjang" });

    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Cari produk" })).toBeFocused();
    await page.keyboard.type(product);
    const brandChips = page.getByRole("group", { name: "Filter merk" });
    await brandChips.getByRole("button", { name: "Merk Uji" }).click();
    await expect(page.getByRole("button", { name: new RegExp(product) })).toBeVisible();
    await brandChips.getByRole("button", { name: "Semua" }).click();
    await addPiece(page, product);
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
    await expect(dialog.getByText("Nama pelanggan wajib diisi.")).toBeVisible();
    await dialog.getByLabel("Nama pelanggan").fill(`Pembeli ${run}`);
    await dialog.getByLabel("No. HP (opsional)").fill("0812-1111-2222");
    await dialog.getByRole("button", { name: "Selesaikan transaksi" }).click();

    const success = page.getByRole("dialog", { name: "Transaksi berhasil" });
    await expect(success).toContainText(/Nomor invoice INV-\d{8}-\d{4}/);
    const invoiceNo = (/INV-\d{8}-\d{4}/.exec(await success.innerText()) ?? [""])[0];
    await expect(success).toContainText(`Kembalian: ${rupiah(100_000 - total)}`);
    await success.getByRole("link", { name: "Cetak struk" }).click();
    await expect(page).toHaveURL(/\/id\/print\/invoices\/[0-9a-f-]+\?print=1&tendered=100000$/);
    await expect(page.getByTestId("invoice")).toContainText("Kembalian");
    await expect(page.getByTestId("invoice")).toContainText(rupiah(100_000 - total));
    await expect(page.getByTestId("invoice")).toContainText("Tunai diterima");
    await expect(page.getByTestId("invoice")).toContainText(`Pembeli ${run}`);
    await expect(page.getByTestId("invoice")).toContainText("Merk Uji · Nappa · 2mm · 93cm x 47cm");
    const saleId = /invoices\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? "";
    await page.goto(`/id/pos/sales/${saleId}`);
    await expect(page).toHaveURL(new RegExp(`/id/pos/sales\\?view=${saleId}$`));
    const detail = page.getByRole("dialog", { name: `Struk ${invoiceNo}` });
    await expect(detail).toContainText(`Pelanggan: Pembeli ${run}`);
    await expect(detail).toContainText("0812-1111-2222");
    await expect(detail.getByRole("row", { name: new RegExp(product) })).toContainText(
      /Rp\s24\.000/,
    );

    await page.goto("/id/pos");
    await expect(page.getByRole("complementary", { name: "Keranjang" })).toContainText(
      "Keranjang kosong",
    );

    await page.getByRole("link", { name: "Riwayat transaksi" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Riwayat transaksi");
    await page.getByRole("searchbox", { name: "No. invoice" }).fill(invoiceNo.slice(-9));
    await expect(page).toHaveURL(/q=/);
    const history = page.getByRole("table", { name: "Riwayat transaksi, terbaru di atas" });
    await expect(history.getByRole("row")).toHaveCount(2);
    await expect(history).toContainText("Tunai");
    await history.getByRole("link", { name: `Buka transaksi ${invoiceNo}` }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]view=${saleId}$`));
    await expect(page.getByRole("dialog", { name: `Struk ${invoiceNo}` })).toBeVisible();
    await page.context().close();
  });

  test("clears the cart with Esc after confirmation", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.getByRole("searchbox", { name: "Cari produk" }).fill(product);
    await addPiece(page, product);
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

  test("sells a custom cut priced per meter off the roll (FR-ROL-04)", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    const cart = page.getByRole("complementary", { name: "Keranjang" });
    await page.getByRole("searchbox", { name: "Cari produk" }).fill(product);
    await page.getByRole("button", { name: new RegExp(product) }).click();
    const picker = page.getByRole("dialog", { name: "Pilih ukuran" });
    await expect(picker).toContainText("Rp\u00a08.000 per meter");
    await picker.getByLabel("Panjang potongan").fill("150");
    await picker.getByRole("button", { name: "Tambah · Rp\u00a012.000" }).click();
    await expect(cart).toContainText(`${product} · Red · Potong 150cm`);
    await expect(cart).toContainText(/Rp\s12\.000 × 1\s*Rp\s12\.000/);

    await page.keyboard.press("F2");
    const dialog = page.getByRole("dialog", { name: "Pembayaran" });
    await dialog.getByLabel("Nama pelanggan").fill(`Pembeli potong ${run}`);
    await dialog.getByRole("button", { name: "Uang pas" }).click();
    await dialog.getByRole("button", { name: "Selesaikan transaksi" }).click();
    await expect(page.getByRole("dialog", { name: "Transaksi berhasil" })).toBeVisible();
    await page.context().close();
  });

  test("deducted the sold pieces and the cut from stock", async ({ page }) => {
    await page.goto(`/id/stock?q=${sku}`);
    await expect(
      page.getByRole("row", { name: new RegExp(`${product} · Red · 93cm x 47cm`) }),
    ).toContainText("7");
    await expect(
      page.getByRole("row", { name: new RegExp(`${product} · Red · Roll`) }),
    ).toContainText("8,5m");
  });

  test("pays by QRIS into the QRIS account set by the owner (FR-PAY-07)", async ({
    page,
    browser,
  }) => {
    await page.goto("/id/settings/bank-accounts");
    await page.getByLabel("Nama bank").fill(`QRIS ${run}`);
    await page.getByLabel("Nomor rekening").fill("9988776655");
    await page.getByLabel("Atas nama").fill("Toko QRIS");
    await page.getByRole("button", { name: "Tambah rekening" }).click();
    await page.getByRole("link", { name: `Ubah QRIS ${run} 9988776655` }).click();
    await page.getByRole("button", { name: "Jadikan rekening QRIS" }).click();
    await page
      .getByRole("dialog", { name: "Jadikan rekening QRIS?" })
      .getByRole("button", { name: "Jadikan rekening QRIS" })
      .click();
    await expectResult(page, "Rekening QRIS disimpan.");

    const pos = await cashierAtPos(browser);
    await pos.getByRole("searchbox", { name: "Cari produk" }).fill(product);
    await addPiece(pos, product);
    await pos.keyboard.press("F2");
    const dialog = pos.getByRole("dialog", { name: "Pembayaran" });
    await dialog.getByLabel("Nama pelanggan").fill(`Pembeli QRIS ${run}`);
    await dialog.getByText("QRIS", { exact: true }).click();
    await expect(dialog).toContainText(`Masuk ke rekening QRIS: QRIS ${run} · 9988776655`);
    await expect(dialog.getByLabel("No. referensi (opsional)")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Selesaikan transaksi" }).click();
    await expect(dialog.getByText("Pilih bank atau e-wallet pengirim.")).toBeVisible();
    await choose(dialog, "Bank / e-wallet pengirim", "Lainnya");
    await dialog.getByLabel("Nama bank atau e-wallet").fill("Bank Lokal");
    await dialog.getByRole("button", { name: "Selesaikan transaksi" }).click();

    const success = pos.getByRole("dialog", { name: "Transaksi berhasil" });
    await success.getByRole("link", { name: "Lihat struk" }).click();
    await expect(pos.getByRole("dialog", { name: /^Struk INV-/ })).toContainText(
      "QRIS · dari Bank Lokal",
    );
    await pos.context().close();
  });
});
