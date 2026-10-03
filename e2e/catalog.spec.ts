import { accounts } from "./accounts";
import { expect, test } from "./fixtures";
import { choose, expectResult, fillProductDetails, pick } from "./helpers";

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

  test("creates a roll product with inline validation (FR-PRD-06, FR-ROL-02)", async ({ page }) => {
    await page.goto("/id/products?new=1");
    const dialog = page.getByRole("dialog", { name: "Produk baru" });
    await page.getByLabel("Nama produk").fill(`Kopi Susu ${run}`);
    await page.getByLabel("SKU").fill(sku);
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expectResult(page, /./, "error");
    await expect(dialog.getByText("Wajib diisi.")).toHaveCount(4);
    await expect(dialog.getByLabel("Harga modal")).toHaveCount(0);

    await choose(dialog, "Merk", brand);
    await dialog.getByLabel("Motif", { exact: true }).click();
    const list = page.getByRole("listbox");
    await list.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await list.evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe("none");
    await page.keyboard.press("Escape");
    await pick(dialog, "Motif", "Lainnya", "mihrab");
    await dialog.getByLabel("Tulis motif lain").fill("Mihrab");
    await pick(dialog, "Motif", "Catur", "catur");
    await expect(dialog.getByLabel("Tulis motif lain")).toHaveCount(0);
    await pick(dialog, "Nama warna", "Navy", "na");
    await expect(dialog.getByLabel("Motif", { exact: true })).toHaveText("Catur");
    await dialog.getByLabel("Ketebalan (mm)").fill("2,5");
    for (const [size, price] of [
      ["93cm x 47cm", "9.000"],
      ["100cm x 70cm", "10.000"],
      ["50cm x 140cm", "11.000"],
      ["100cm x 140cm", "20.000"],
    ] as const) {
      await dialog.getByLabel(`Harga ${size}`).fill(price);
      await dialog.getByLabel(`Harga cacat ${size}`).fill("5.000");
    }
    await page.getByLabel("Harga jual").fill("abc");
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
    await expect(row).toContainText(/Rp\s18\.000 \/ m/);
    await expect(row).toContainText(/93cm x 47cm: Rp\s9\.000/);
    await expect(row).not.toContainText(/Rp\s10\.000/);
    await expect(row.getByText("Stok menipis")).toBeVisible();
    await expect(row).toContainText("3D Catur");
    await expect(row.getByRole("cell", { name: "Navy", exact: true })).toBeVisible();
    await expect(row).toContainText("2,5mm");
    await expect(row).toContainText("Roll · dipotong per ukuran");

    const brandGroup = page.getByRole("button", { name: new RegExp(`^${brand}\\s*1 produk`) });
    await expect(brandGroup).toHaveAttribute("aria-expanded", "true");
    await brandGroup.click();
    await expect(row).toHaveCount(0);
    await brandGroup.click();
    await expect(row).toBeVisible();

    await page.goto(`/id/products?q=${encodeURIComponent(`kopi susu ${run}`)}`);
    await expect(page.getByRole("row", { name: new RegExp(`Kopi Susu ${run}`) })).toBeVisible();

    await row.getByRole("link").first().click();
    await expect(page.getByLabel("Harga 100cm x 140cm")).toHaveValue("20.000");
    await expect(page.getByLabel("Ketebalan (mm)")).toHaveValue("2,5");

    await page.goto("/id/products");
    const products = page.getByRole("table", { name: "Daftar produk" });
    await expect(products.getByRole("button", { expanded: true })).toHaveCount(0);
    await expect(products.getByRole("button", { expanded: false }).first()).toBeVisible();
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

  test("deletes a product (FR-PRD-03, ADR-0041)", async ({ page }) => {
    await page.goto(`/id/products?q=${sku}`);
    await page.getByRole("link", { name: `Ubah Kopi Susu ${run}` }).click();
    await page.getByRole("button", { name: "Hapus" }).click();
    await page
      .getByRole("dialog", { name: `Hapus Kopi Susu ${run}?` })
      .getByRole("button", { name: "Hapus" })
      .click();
    await expect(page.getByText("Produk dihapus.")).toBeVisible();
    await expect(page).toHaveURL(/\/id\/products$/);

    await page.goto(`/id/products?q=${sku}`);
    await expect(page.getByText("Tidak ada produk yang cocok")).toBeVisible();
  });
});
