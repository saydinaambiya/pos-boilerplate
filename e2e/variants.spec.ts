import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures";
import { choose, expectResult } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Kaos ${run}`;
const sku = `KAOS-${run}`.toUpperCase();

test.describe("colour variants (FR-VAR)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful variant flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares a product with stock", async ({ page }) => {
    await page.goto("/id/products/categories");
    await page.getByLabel("Nama kategori").fill(`Pakaian ${run}`);
    await page.getByRole("button", { name: "Tambah kategori" }).click();
    await expectResult(page, "Kategori disimpan.");

    await page.goto("/id/products/new");
    await page.getByLabel("Nama produk").fill(product);
    await choose(page, "Kategori", `Pakaian ${run}`);
    await page.getByLabel("Harga jual").fill("50000");
    await page.getByLabel("SKU").fill(sku);
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page).toHaveURL(/\/id\/products$/);

    await page.goto(`/id/stock?q=${sku}`);
    await page.getByRole("link", { name: `Buka stok ${product}` }).click();
    await page.getByLabel("Jumlah").first().fill("7");
    await page.getByRole("button", { name: "Tambah stok" }).click();
    await expectResult(page, "Stok diperbarui: +7 → 7.");
  });

  test("enables variants and moves the stock to the first colour", async ({ page }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah ${product}` }).click();
    await expect(page.getByText("Stok produk saat ini (7) dipindahkan")).toBeVisible();

    await page.getByLabel("Nama warna").fill("Merah");
    await page.getByLabel("Kode warna (hex)").fill("E53935");
    await page.getByLabel("SKU", { exact: true }).last().fill(`${sku}-M`);
    await page.getByRole("button", { name: "Aktifkan varian" }).click();

    const table = page.getByRole("table", { name: "Daftar varian warna" });
    const red = table.getByRole("row", { name: /Merah/ });
    await expect(red).toContainText("Utama");
    await expect(red).toContainText("7");
    await expect(red.locator("circle[fill^='#']")).toHaveAttribute("fill", "#E53935");
    await expect(page.getByLabel("Stok minimum")).toHaveCount(1);
  });

  test("adds a second colour with opening stock and reorders", async ({ page }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah ${product}` }).click();

    await page.getByLabel("Nama warna").fill("merah");
    await page.getByLabel("SKU", { exact: true }).last().fill(`${sku}-X`);
    await page.getByRole("button", { name: "Tambah varian" }).click();
    await expectResult(page, /./, "error");
    await expect(
      page.getByText("Nama warna sudah dipakai varian lain di produk ini."),
    ).toBeVisible();

    await page.getByLabel("Nama warna").fill("Biru Laut");
    await page.getByLabel("Kode warna (hex)").fill("");
    await page.getByLabel("SKU", { exact: true }).last().fill(`${sku}-B`);
    await page.getByLabel("Harga jual khusus").fill("55.000");
    await page.getByLabel("Stok awal").fill("3");
    await page.getByRole("button", { name: "Tambah varian" }).click();
    await expectResult(page, "Varian ditambahkan.");

    const table = page.getByRole("table", { name: "Daftar varian warna" });
    const blue = table.getByRole("row", { name: /Biru Laut/ });
    await expect(blue).toContainText(/Rp\s55\.000/);
    await expect(blue.locator("svg text")).toHaveText("BL");

    await page.getByRole("button", { name: "Naikkan Biru Laut" }).click();
    await expect(table.getByRole("row").nth(1)).toContainText("Biru Laut");

    await page.goto("/id/products?q=biru laut");
    await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText("2 varian");
    await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText("10");
  });

  test("keeps the primary colour active and deactivates another", async ({ page }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah ${product}` }).click();
    await page.getByRole("link", { name: "Ubah Merah" }).click();
    await expect(
      page.getByText("Varian utama tidak dapat dinonaktifkan selama produk aktif."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Nonaktifkan" })).toHaveCount(0);

    await page.getByRole("link", { name: "Kembali ke produk" }).click();
    await page.getByRole("link", { name: "Ubah Biru Laut" }).click();
    await page.getByRole("button", { name: "Nonaktifkan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Nonaktifkan" }).click();
    await expect(page.getByText("Varian nonaktif dan tidak dijual.")).toBeVisible();

    await page.goto(`/id/stock?q=${sku}`);
    await expect(page.getByRole("link", { name: `Buka stok ${product} · Merah` })).toBeVisible();
    await expect(page.getByRole("link", { name: `Buka stok ${product} · Biru Laut` })).toHaveCount(
      0,
    );
    await page.getByRole("link", { name: `Buka stok ${product} · Merah` }).click();
    await expect(
      page.getByRole("table", { name: "Pergerakan stok, terbaru di atas" }),
    ).toContainText("Penyesuaian");
  });

  test("product page with variants has no accessibility violations (FR-UX-06)", async ({
    page,
  }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah ${product}` }).click();
    await expect(page.getByRole("table", { name: "Daftar varian warna" })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
