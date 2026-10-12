import { E2E_BRAND } from "./accounts";
import { expect, test } from "./fixtures";
import { cashierAtPos, choose, expectResult, pick } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const glue = `Lem ${run}`;
const sku = `LEM-${run}`.toUpperCase();

test.describe("accessories sold by the kg (FR-PRD-07, ADR-0045)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful accessory flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("adds an accessory with brand, colour and a kg unit", async ({ page }) => {
    await page.goto("/id/products?new=1");
    const dialog = page.getByRole("dialog", { name: "Produk baru" });
    await dialog.getByRole("link", { name: "Aksesoris" }).click();
    await expect(page).toHaveURL(/category=ACCESSORY/);
    await expect(dialog.getByLabel("Motif", { exact: true })).toHaveCount(0);

    await choose(dialog, "Merk", E2E_BRAND);
    await dialog.getByLabel("Nama produk").fill(glue);
    await pick(dialog, "Nama warna", "Red");
    await choose(dialog, "Satuan", "kg");
    await dialog.getByLabel("Harga jual per satuan").fill("40.000");
    await dialog.getByLabel("SKU").fill(sku);
    await dialog.getByLabel("Stok minimum").fill("0,5");
    await dialog.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page).toHaveURL(/\/id\/products$/);

    await page.goto(`/id/products?q=${sku}`);
    const row = page.getByRole("row", { name: new RegExp(glue) });
    await expect(row).toContainText("Aksesoris · kg");
    await expect(row).toContainText(/Rp\s40\.000 \/ kg/);
  });

  test("receives stock in kg with decimals", async ({ page }) => {
    await page.goto(`/id/stock?q=${sku}`);
    await page.getByRole("link", { name: `Buka stok ${glue} · Red`, exact: true }).click();
    await page.getByLabel("Berat (kg)").first().fill("2,5");
    await page.getByRole("button", { name: "Tambah stok" }).click();
    await expectResult(page, "Stok diperbarui: +2,5kg → 2,5kg.");
  });

  test("sells a weight at the cashier, priced per kg", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    const cart = page.getByRole("complementary", { name: "Keranjang" });
    await page.getByRole("searchbox", { name: "Cari produk" }).fill(glue);
    await page.getByRole("button", { name: new RegExp(glue) }).click();
    const picker = page.getByRole("dialog", { name: "Isi berat" });
    await picker.getByLabel("Berat (kg)").fill("0,5");
    await picker.getByRole("button", { name: "Tambah · Rp 20.000" }).click();
    await expect(cart).toContainText(`${glue} · Red · 0,5kg`);

    await page.keyboard.press("F2");
    const dialog = page.getByRole("dialog", { name: "Pembayaran" });
    await dialog.getByLabel("Nama pelanggan").fill(`Pembeli lem ${run}`);
    await dialog.getByRole("button", { name: "Uang pas" }).click();
    await dialog.getByRole("button", { name: "Selesaikan transaksi" }).click();
    await expect(page.getByRole("dialog", { name: "Transaksi berhasil" })).toBeVisible();
    await page.context().close();
  });

  test("took the weight off the stock", async ({ page }) => {
    await page.goto(`/id/stock?q=${sku}`);
    await expect(page.getByRole("row", { name: new RegExp(glue) })).toContainText("2kg");
  });
});
