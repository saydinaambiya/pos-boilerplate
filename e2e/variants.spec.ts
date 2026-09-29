import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures";
import { expectResult, fillProductDetails, pick, receiveRoll } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Kaos ${run}`;
const sku = `KAOS-${run}`.toUpperCase();
const blue = "Blue";

test.describe("colour variants (FR-VAR)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful variant flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares a product with stock", async ({ page }) => {
    await page.goto("/id/products?new=1");
    await page.getByLabel("Nama produk").fill(product);
    await fillProductDetails(page.getByRole("dialog"));
    await page.getByLabel("Harga jual").fill("50000");
    await page.getByLabel("SKU").fill(sku);
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page).toHaveURL(/\/id\/products$/);

    await receiveRoll(page, sku, product, "7");
  });

  test("starts with the colour chosen when the product was added (ADR-0026)", async ({ page }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah ${product}` }).click();
    await expect(page.getByRole("button", { name: "Aktifkan varian" })).toHaveCount(0);

    const table = page.getByRole("table", { name: "Daftar varian warna" });
    const red = table.getByRole("row", { name: /Red/ });
    await expect(red).toContainText("Utama");
    await expect(red).toContainText("7m");
    await expect(red).toContainText("93cm x 47cm: 0 pcs");
    await expect(red.locator("circle[fill^='#']")).toHaveAttribute("fill", "#D32F2F");
    await expect(page.getByLabel("Kode warna (hex)")).toHaveCount(0);
    await expect(page.getByLabel("Stok minimum")).toHaveCount(1);
  });

  test("adds a second colour with opening stock and reorders", async ({ page }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah ${product}` }).click();

    await pick(page, "Nama warna", "Red");
    await page.getByLabel("SKU", { exact: true }).last().fill(`${sku}-X`);
    await page.getByRole("button", { name: "Tambah varian" }).click();
    await expectResult(page, /./, "error");
    await expect(
      page.getByText("Nama warna sudah dipakai varian lain di produk ini."),
    ).toBeVisible();

    await pick(page, "Nama warna", blue, "bl");
    await page.getByLabel("SKU", { exact: true }).last().fill(`${sku}-B`);
    await expect(page.getByLabel("Harga jual khusus")).toHaveCount(0);
    await page.getByLabel("Stok awal roll (m)").fill("3");
    await page.getByRole("button", { name: "Tambah varian" }).click();
    await expectResult(page, "Varian ditambahkan.");

    const table = page.getByRole("table", { name: "Daftar varian warna" });
    const blueRow = table.getByRole("row", { name: new RegExp(blue) });
    await expect(blueRow).toContainText(/Rp\s50\.000 \/ m/);
    await expect(blueRow).toContainText("3m");
    await expect(blueRow.locator("circle[fill^='#']")).toHaveAttribute("fill", "#1E88E5");

    await page.getByRole("button", { name: `Naikkan ${blue}` }).click();
    await expect(table.getByRole("row").nth(1)).toContainText(blue);

    await page.goto(`/id/products?q=${sku}`);
    await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText("2 varian");
    await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText("10m");
  });

  test("keeps the primary colour active and deactivates another", async ({ page }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah ${product}` }).click();
    await page.getByRole("link", { name: "Ubah Red" }).click();
    const red = page.getByRole("dialog", { name: `${product} · Red` });
    await expect(
      red.getByText("Varian utama tidak dapat dinonaktifkan selama produk aktif."),
    ).toBeVisible();
    await expect(red.getByRole("button", { name: "Nonaktifkan" })).toHaveCount(0);

    await red.getByRole("button", { name: "Tutup" }).click();
    await expect(red).toBeHidden();
    await page.getByRole("link", { name: `Ubah ${blue}` }).click();
    const blueDialog = page.getByRole("dialog", { name: `${product} · ${blue}` });
    await blueDialog.getByRole("button", { name: "Nonaktifkan" }).click();
    await page
      .getByRole("dialog", { name: `Nonaktifkan varian ${blue}?` })
      .getByRole("button", { name: "Nonaktifkan" })
      .click();
    await expectResult(page, "Berhasil dinonaktifkan.");
    await expect(blueDialog.getByText("Varian nonaktif dan tidak dijual.")).toBeVisible();

    await page.goto(`/id/stock?q=${sku}`);
    await expect(
      page.getByRole("link", { name: `Buka stok ${product} · Red · Roll`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: `Buka stok ${product} · Red · 93cm x 47cm` }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: `Buka stok ${product} · ${blue}` })).toHaveCount(0);
    await page
      .getByRole("link", { name: `Buka stok ${product} · Red · Roll`, exact: true })
      .click();
    await expect(
      page.getByRole("table", { name: "Pergerakan stok, terbaru di atas" }),
    ).toContainText("Masuk");
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
