import { accounts } from "./accounts";
import { expect, test } from "./fixtures";
import { choose, expectResult, fillProductDetails } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const sku = `KOPI-${run}`.toUpperCase();
const brand = `Merk ${run}`;

test.describe("brands & products (FR-CAT-02, FR-PRD)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful catalog flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("creates a brand (FR-CAT-02)", async ({ page }) => {
    await page.goto("/id/products/brands");
    await page.getByLabel("Nama merk").fill(brand);
    await page.getByRole("button", { name: "Tambah merk" }).click();
    await expectResult(page, "Merk disimpan.");
    await expect(page.getByRole("link", { name: `Ubah ${brand}` })).toBeVisible();
  });

  test("creates a product with inline validation", async ({ page }) => {
    await page.goto("/id/products?new=1");
    const dialog = page.getByRole("dialog", { name: "Produk baru" });
    await page.getByLabel("Nama produk").fill(`Kopi Susu ${run}`);
    await page.getByLabel("SKU").fill(sku);
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expectResult(page, /./, "error");
    await expect(dialog.getByText("Wajib diisi.")).toHaveCount(3);

    await choose(dialog, "Merk", brand);
    await dialog.getByLabel("Motif").fill("Mihrab");
    await choose(dialog, "Ukuran", "100 × 70 cm");
    await page.getByLabel("Harga jual").fill("abc");
    await page.getByLabel("Harga modal").fill("7.000");
    await page.getByLabel("SKU").fill(sku);
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Format tidak valid.")).toBeVisible();
    await expect(page.getByLabel("Harga jual")).toBeFocused();
    await expect(dialog.getByLabel("Merk", { exact: true })).toHaveText(brand);

    await page.getByLabel("Harga jual").fill("18.000");
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page).toHaveURL(/\/id\/products$/);

    await page.getByLabel("Cari").fill(sku.toLowerCase());
    await expect(page).toHaveURL(new RegExp(`q=${sku.toLowerCase()}`));
    const row = page.getByRole("row", { name: new RegExp(`Kopi Susu ${run}`) });
    await expect(row).toContainText(/Rp\s18\.000/);
    await expect(row).toContainText(/Rp\s11\.000/);
    await expect(row.getByText("Stok menipis")).toBeVisible();
    await expect(row).toContainText(brand);
    await expect(row).toContainText("Mihrab");
    await expect(row).toContainText("100 × 70 cm");

    await page.goto("/id/products?q=mihrab");
    await expect(page.getByRole("row", { name: new RegExp(`Kopi Susu ${run}`) })).toBeVisible();
    await page.goto("/id/products?size=50x140");
    await expect(page.getByRole("row", { name: new RegExp(`Kopi Susu ${run}`) })).toHaveCount(0);
  });

  test("rejects a duplicate SKU", async ({ page }) => {
    await page.goto("/id/products?new=1");
    await page.getByLabel("Nama produk").fill("Duplikat");
    await fillProductDetails(page.getByRole("dialog"));
    await page.getByLabel("Harga jual").fill("1000");
    await page.getByLabel("SKU").fill(sku.toLowerCase());
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page.getByText("SKU sudah dipakai produk lain.")).toBeVisible();
  });

  test("keeps brands with products and hides cost from cashiers", async ({ page, browser }) => {
    await page.goto("/id/products/brands");
    await page.getByRole("link", { name: `Ubah ${brand}` }).click();
    await expect(page.getByRole("dialog", { name: "Ubah merk" })).toBeVisible();
    await expect(page.getByText("dipakai 1 produk sehingga tidak dapat dihapus")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hapus merk" })).toHaveCount(0);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const cashier = await context.newPage();
    await cashier.goto("/id/login");
    await cashier.getByLabel("Username").fill(accounts.cashier.username);
    await cashier.getByRole("button", { name: "Lanjut" }).click();
    await cashier.getByLabel(/^(Password|PIN)$/).fill(accounts.cashier.pin);
    await cashier.getByRole("button", { name: "Masuk" }).click();
    await expect(cashier).toHaveURL(/\/id$/);
    await cashier.goto(`/id/products?q=${sku}`);
    await expect(cashier.getByRole("row", { name: new RegExp(`Kopi Susu ${run}`) })).toBeVisible();
    await expect(cashier.getByRole("columnheader", { name: "Harga modal" })).toHaveCount(0);
    await expect(cashier.getByRole("link", { name: "Tambah produk" })).toHaveCount(0);
    await cashier.goto("/id/products?new=1");
    await expect(cashier.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(cashier.getByRole("dialog")).toHaveCount(0);
    await context.close();
  });

  test("deactivates a product", async ({ page }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah Kopi Susu ${run}` }).click();
    await page.getByRole("button", { name: "Nonaktifkan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Nonaktifkan" }).click();
    await expect(page.getByText("Produk nonaktif dan tidak tampil di kasir.")).toBeVisible();

    await page.goto(`/id/products?q=${sku}`);
    await expect(page.getByText("Tidak ada produk yang cocok")).toBeVisible();
    await page.goto(`/id/products?q=${sku}&status=inactive`);
    await expect(page.getByRole("row", { name: new RegExp(`Kopi Susu ${run}`) })).toBeVisible();
  });
});
