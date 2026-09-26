import { accounts } from "./accounts";
import { expect, test } from "./fixtures";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const category = `Minuman ${run}`;
const sku = `KOPI-${run}`.toUpperCase();

test.describe("categories & products (FR-CAT-01, FR-PRD)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful catalog flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("creates a category", async ({ page }) => {
    await page.goto("/id/products/categories");
    await page.getByLabel("Nama kategori").fill(category);
    await page.getByRole("button", { name: "Tambah kategori" }).click();
    await expect(page.getByRole("status")).toHaveText("Kategori disimpan.");
    await expect(page.getByRole("link", { name: `Ubah ${category}` })).toBeVisible();
  });

  test("creates a product with inline validation", async ({ page }) => {
    await page.goto("/id/products/new");
    await page.getByLabel("Nama produk").fill(`Kopi Susu ${run}`);
    await page.getByLabel("Kategori").selectOption({ label: category });
    await page.getByLabel("Harga jual").fill("abc");
    await page.getByLabel("Harga modal").fill("7.000");
    await page.getByLabel("SKU").fill(sku);
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page.getByText("Format tidak valid.")).toBeVisible();
    await expect(page.getByLabel("Harga jual")).toBeFocused();
    await expect(page.getByLabel("Kategori").locator("option:checked")).toHaveText(category);

    await page.getByLabel("Harga jual").fill("18.000");
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page).toHaveURL(/\/id\/products$/);

    await page.getByLabel("Cari").fill(sku.toLowerCase());
    await page.getByRole("button", { name: "Terapkan" }).click();
    const row = page.getByRole("row", { name: new RegExp(`Kopi Susu ${run}`) });
    await expect(row).toContainText(/Rp\s18\.000/);
    await expect(row).toContainText(/Rp\s11\.000/);
    await expect(row.getByText("Stok menipis")).toBeVisible();
  });

  test("rejects a duplicate SKU", async ({ page }) => {
    await page.goto("/id/products/new");
    await page.getByLabel("Nama produk").fill("Duplikat");
    await page.getByLabel("Kategori").selectOption({ label: category });
    await page.getByLabel("Harga jual").fill("1000");
    await page.getByLabel("SKU").fill(sku.toLowerCase());
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page.getByText("SKU sudah dipakai produk lain.")).toBeVisible();
  });

  test("keeps categories with products and hides cost from cashiers", async ({ page, browser }) => {
    await page.goto("/id/products/categories");
    await page.getByRole("link", { name: `Ubah ${category}` }).click();
    await expect(page.getByText("berisi 1 produk sehingga tidak dapat dihapus")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hapus kategori" })).toHaveCount(0);

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const cashier = await context.newPage();
    await cashier.goto("/id/login");
    await cashier.getByLabel("Username").fill(accounts.cashier.username);
    await cashier.getByLabel("Password atau PIN").fill(accounts.cashier.pin);
    await cashier.getByRole("button", { name: "Masuk" }).click();
    await expect(cashier).toHaveURL(/\/id$/);
    await cashier.goto(`/id/products?q=${sku}`);
    await expect(cashier.getByRole("row", { name: new RegExp(`Kopi Susu ${run}`) })).toBeVisible();
    await expect(cashier.getByRole("columnheader", { name: "Harga modal" })).toHaveCount(0);
    await expect(cashier.getByRole("link", { name: "Tambah produk" })).toHaveCount(0);
    expect((await cashier.goto("/id/products/new"))?.status()).toBe(403);
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
