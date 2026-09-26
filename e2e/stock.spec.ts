import { expect, test } from "./fixtures";
import { expectResult } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Gula ${run}`;
const sku = `GULA-${run}`.toUpperCase();

test.describe("stock ledger (FR-STK)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful stock flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares a stock-tracked product", async ({ page }) => {
    await page.goto("/id/products/categories");
    await page.getByLabel("Nama kategori").fill(`Sembako ${run}`);
    await page.getByRole("button", { name: "Tambah kategori" }).click();
    await expectResult(page, "Kategori disimpan.");

    await page.goto("/id/products/new");
    await page.getByLabel("Nama produk").fill(product);
    await page.getByLabel("Kategori").selectOption({ label: `Sembako ${run}` });
    await page.getByLabel("Harga jual").fill("15000");
    await page.getByLabel("SKU").fill(sku);
    await page.getByLabel("Stok minimum").fill("5");
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page).toHaveURL(/\/id\/products$/);
  });

  test("receives, counts and writes off stock with a full history", async ({ page }) => {
    await page.goto(`/id/stock?q=${sku}`);
    await page.getByRole("link", { name: `Buka stok ${product}` }).click();

    const receive = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Tambah stok" }) });
    await receive.getByLabel("Jumlah").fill("12");
    await receive.getByLabel("Catatan").fill("Faktur 77");
    await receive.getByRole("button", { name: "Tambah stok" }).click();
    await expectResult(page, "Stok diperbarui: +12 → 12.");

    const count = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Simpan hasil opname" }) });
    await count.getByLabel("Jumlah fisik").fill("10");
    await count.getByRole("button", { name: "Simpan hasil opname" }).click();
    await expectResult(page, /./, "error");
    await expect(count.getByText("Wajib diisi.")).toBeVisible();
    await expect(count.getByLabel("Alasan")).toBeFocused();
    await count.getByLabel("Alasan").fill("Opname mingguan");
    await count.getByRole("button", { name: "Simpan hasil opname" }).click();
    await expectResult(page, "Stok diperbarui: -2 → 10.");

    const writeOff = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Catat write-off" }) });
    await writeOff.getByLabel("Jumlah").fill("11");
    await writeOff.getByLabel("Alasan").fill("Basah");
    await writeOff.getByRole("button", { name: "Catat write-off" }).click();
    await expectResult(page, /./, "error");
    await expect(writeOff.getByText("Stok tidak cukup. Tersedia 10.")).toBeVisible();
    await writeOff.getByLabel("Jumlah").fill("6");
    await writeOff.getByRole("button", { name: "Catat write-off" }).click();
    await expectResult(page, "Stok diperbarui: -6 → 4.");

    const history = page.getByRole("table", { name: "Pergerakan stok, terbaru di atas" });
    await expect(history.getByRole("row")).toHaveCount(4);
    await expect(history.getByRole("row").nth(1)).toContainText("Write-off");
    await expect(history.getByRole("row").nth(3)).toContainText("Faktur 77");

    await page.getByLabel("Tipe").selectOption({ label: "Penyesuaian" });
    await page.getByRole("button", { name: "Terapkan" }).click();
    await expect(history.getByRole("row")).toHaveCount(2);
    await expect(history).toContainText("Opname mingguan");
  });

  test("flags the product as low stock on the dashboard", async ({ page }) => {
    await page.goto("/id");
    await expect(
      page.getByRole("list", { name: "Varian dengan stok pada atau di bawah minimum" }),
    ).toBeVisible();
    await page.goto(`/id/stock?q=${sku}&low=1`);
    await expect(
      page.getByRole("row", { name: new RegExp(product) }).getByText("Stok menipis"),
    ).toBeVisible();
  });
});
