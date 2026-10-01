import { expect, test } from "./fixtures";
import { choose, cutPieces, expectResult, fillProductDetails } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Gula ${run}`;
const sku = `GULA-${run}`.toUpperCase();

test.describe("stock ledger (FR-STK)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful stock flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares a roll product", async ({ page }) => {
    await page.goto("/id/products?new=1");
    await page.getByLabel("Nama produk").fill(product);
    await fillProductDetails(page.getByRole("dialog"));
    await page.getByLabel("Harga jual").fill("15000");
    await page.getByLabel("SKU").fill(sku);
    await page.getByLabel("Stok minimum roll (m)").fill("5");
    await page.getByRole("button", { name: "Simpan produk" }).click();
    await expect(page).toHaveURL(/\/id\/products$/);
  });

  test("receives, counts and writes off roll meters with a full history", async ({ page }) => {
    await page.goto(`/id/stock?q=${sku}`);
    await page
      .getByRole("link", { name: `Buka stok ${product} · Red · Roll`, exact: true })
      .click();

    const receive = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Tambah stok" }) });
    await receive.getByLabel("Panjang (m)").fill("12");
    await receive.getByLabel("Catatan").fill("Faktur 77");
    await receive.getByRole("button", { name: "Tambah stok" }).click();
    await expectResult(page, "Stok diperbarui: +12m → 12m.");

    const count = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Simpan hasil opname" }) });
    await count.getByLabel("Panjang fisik (m)").fill("10");
    await count.getByRole("button", { name: "Simpan hasil opname" }).click();
    await expectResult(page, /./, "error");
    await expect(count.getByText("Wajib diisi.")).toBeVisible();
    await expect(count.getByLabel("Alasan")).toBeFocused();
    await count.getByLabel("Alasan").fill("Opname mingguan");
    await count.getByRole("button", { name: "Simpan hasil opname" }).click();
    await expectResult(page, "Stok diperbarui: -2m → 10m.");

    const writeOff = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Catat write-off" }) });
    await writeOff.getByLabel("Panjang (m)").fill("11");
    await writeOff.getByLabel("Alasan").fill("Basah");
    await writeOff.getByRole("button", { name: "Catat write-off" }).click();
    await expectResult(page, /./, "error");
    await expect(writeOff.getByText("Stok tidak cukup. Tersedia 10m.")).toBeVisible();
    await writeOff.getByLabel("Panjang (m)").fill("5,5");
    await writeOff.getByRole("button", { name: "Catat write-off" }).click();
    await expectResult(page, "Stok diperbarui: -5,5m → 4,5m.");

    const history = page.getByRole("table", { name: "Pergerakan stok, terbaru di atas" });
    await expect(history.getByRole("row")).toHaveCount(4);
    await expect(history.getByRole("row").nth(1)).toContainText("Write-off");
    await expect(history.getByRole("row").nth(3)).toContainText("Faktur 77");

    await choose(page, "Tipe", "Penyesuaian");
    await expect(page).toHaveURL(/type=ADJUSTMENT/);
    await expect(history.getByRole("row")).toHaveCount(2);
    await expect(history).toContainText("Opname mingguan");
  });

  test("adds pieces only by cutting the roll (FR-ROL-03)", async ({ page }) => {
    await page.goto(`/id/stock?q=${sku}`);
    await page.getByRole("link", { name: `Buka stok ${product} · Red · 93cm x 47cm` }).click();
    await expect(
      page.getByText("Potongan bertambah lewat menu Potong Roll, bukan dari barang masuk."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Tambah stok" })).toHaveCount(0);

    await cutPieces(page, product, "3", "1,5");
    await page.goto(`/id/stock?q=${sku}`);
    await expect(
      page.getByRole("row", { name: new RegExp(`${product} · Red · 93cm x 47cm`) }),
    ).toContainText("3");
    await expect(
      page.getByRole("row", { name: new RegExp(`${product} · Red · Roll`) }),
    ).toContainText("3m");
    await page.goto(`/id/cutting?q=${encodeURIComponent(product)}`);
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: product })
        .filter({ hasText: "Dipotong 1,5m, sisa roll 3m" }),
    ).toContainText("3 pcs 93cm x 47cm");
  });

  test("books a defect cut apart and filters defect stock (FR-ROL-05)", async ({ page }) => {
    await page.goto(`/id/cutting?q=${encodeURIComponent(product)}`);
    await page.getByRole("link", { name: `Potong ${product} · Red`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Potong ${product} · Red` });
    await dialog.getByLabel("Panjang dipotong (m)").fill("0,5");
    await dialog.getByLabel("Barang cacat").check();
    await expect(dialog).toContainText("Hasil potongan cacat");
    await dialog.getByLabel(/^93cm x 47cm/).fill("1");
    await dialog.getByRole("button", { name: "Simpan potongan" }).click();
    await expectResult(page, "Potongan cacat dicatat");
    await expect(
      page.getByRole("listitem").filter({ hasText: product }).filter({ hasText: "Cacat" }),
    ).toHaveCount(1);

    await page.goto(`/id/stock?q=${sku}&defect=1`);
    await expect(page.getByRole("row")).toHaveCount(3);
    await expect(
      page.getByRole("row", { name: new RegExp(`${product} · Red · 93cm x 47cm · Cacat`) }),
    ).toContainText("1");
  });

  test("refuses a cut longer than the roll", async ({ page }) => {
    await page.goto(`/id/cutting?q=${encodeURIComponent(product)}`);
    await page.getByRole("link", { name: `Potong ${product} · Red`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Potong ${product} · Red` });
    await dialog.getByLabel("Panjang dipotong (m)").fill("4");
    await dialog.getByLabel(/^100cm x 140cm/).fill("5");
    await expect(dialog).toContainText("-1,5m");
    await expect(dialog).toContainText("biasanya butuh sekitar 5m, lebih dari 4m");
    await dialog.getByRole("button", { name: "Simpan potongan" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Roll tidak cukup. Butuh 4m, tersisa 2,5m.");
  });

  test("folds a roll's pieces under its row (FR-STK-08)", async ({ page }) => {
    await page.goto(`/id/stock?q=${sku}`);
    const toggle = page.getByRole("button", { name: new RegExp(`^Potongan ${product} · Red`) });
    const piece = page.getByRole("link", {
      name: `Buka stok ${product} · Red · 93cm x 47cm`,
      exact: true,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(piece).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(piece).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: `Buka stok ${product} · Red · Roll`, exact: true }),
    ).toBeVisible();
  });

  test("starts on stock with a minimum, folded, and remembers unticking it (FR-STK-09)", async ({
    page,
  }) => {
    await page.goto("/id/stock");
    const minimum = page.getByLabel("Hanya yang ada stok minimum");
    await expect(minimum).toBeChecked();
    await expect(
      page.getByRole("table", { name: "Daftar stok" }).getByRole("button", { expanded: true }),
    ).toHaveCount(0);
    await minimum.uncheck();
    await expect(page).toHaveURL(/minimum=0/);
    await expect(minimum).not.toBeChecked();
    await page.getByRole("link", { name: "Reset" }).click();
    await expect(minimum).toBeChecked();
  });

  test("keeps a minimum on the 93x47 piece and filters stock with one (FR-STK-09)", async ({
    page,
  }) => {
    await page.goto(`/id/stock?q=${sku}`);
    await page
      .getByRole("link", { name: `Buka stok ${product} · Red · 100cm x 70cm`, exact: true })
      .click();
    await expect(page.getByLabel("Stok minimum (pcs)")).toHaveCount(0);

    await page.goto(`/id/stock?q=${sku}`);
    await page
      .getByRole("link", { name: `Buka stok ${product} · Red · 93cm x 47cm`, exact: true })
      .click();
    await page.getByLabel("Stok minimum (pcs)").fill("10");
    await page.getByRole("button", { name: "Simpan minimum" }).click();
    await expectResult(page, "Stok minimum disimpan: 10 pcs.");

    await page.goto(`/id/stock?q=${sku}&minimum=1`);
    await expect(
      page.getByRole("link", { name: `Buka stok ${product} · Red · Roll`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(`${product} · Red · 93cm x 47cm`) }),
    ).toContainText("Stok menipis");
    await expect(
      page.getByRole("link", { name: `Buka stok ${product} · Red · 100cm x 70cm`, exact: true }),
    ).toHaveCount(0);
  });

  test("flags the product as low stock on the dashboard", async ({ page }) => {
    await page.goto("/id/dashboard");
    await expect(
      page.getByRole("list", { name: "Varian dengan stok pada atau di bawah minimum" }),
    ).toBeVisible();
    await page.goto(`/id/stock?q=${sku}&low=1`);
    await expect(
      page
        .getByRole("row", { name: new RegExp(`${product} · Red · Roll`) })
        .getByText("Stok menipis"),
    ).toBeVisible();
  });
});
