import { expect, test } from "./fixtures";
import {
  cashierAtPos,
  createStockedProduct,
  expectResult,
  grantEmployeePermission,
} from "./helpers";

/** Names are unique per run because the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Keripik Sales ${run}`;
const sku = `SALES-${run}`.toUpperCase();

test.describe("field sales goods (FR-CSG-01..05)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful consignment flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares stock and lets employees carry goods", async ({ page }) => {
    await createStockedProduct(page, {
      name: product,
      sku,
      price: "5000",
      stock: "20",
    });
    await grantEmployeePermission(page, "Halaman Sales (barang bawaan sales)");
    await grantEmployeePermission(page, "Ambil dan setor barang bawaan sendiri");
  });

  test("a salesperson takes goods on two visits and settles part of them", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.goto("/id/consignments?take=1");
    const take = page.getByRole("dialog", { name: "Ambil barang" });
    await take.getByRole("searchbox").fill(product);
    await take.getByRole("button", { name: `Tambah ${product}` }).click();
    await take.getByLabel(`Jumlah ${product}`).fill("5");
    await take.getByRole("button", { name: "Simpan barang dibawa" }).click();
    await expectResult(page, "Barang yang dibawa sudah dicatat.");
    await expect(page).toHaveURL(/\/id\/consignments\/[0-9a-f-]+$/);
    const balance = page.getByRole("table", { name: "Ringkasan per barang" });
    await expect(balance.getByRole("row", { name: new RegExp(product) })).toContainText("5");

    await page.getByRole("link", { name: "Tambah barang" }).click();
    const more = page.getByRole("dialog", { name: "Ambil barang" });
    await more.getByRole("searchbox").fill(product);
    await more.getByRole("button", { name: `Tambah ${product}` }).click();
    await more.getByLabel(`Jumlah ${product}`).fill("2");
    await more.getByRole("button", { name: "Simpan barang dibawa" }).click();
    await expectResult(page, "Barang yang dibawa sudah dicatat.");
    /** One line of the dated history: the product and what happened to it. */
    const historyLine = (what: string) =>
      page.getByRole("listitem").filter({ hasText: new RegExp(`^${product}\\s*${what}$`) });
    await expect(historyLine("5 diambil")).toHaveCount(1);
    await expect(historyLine("2 diambil")).toHaveCount(1);

    await page.getByRole("link", { name: "Setor" }).click();
    const settle = page.getByRole("dialog", { name: "Setor hasil penjualan" });
    await settle.getByLabel(`Terjual, ${product}`).fill("4");
    await settle.getByLabel(`Dikembalikan, ${product}`).fill("1");
    await settle.getByLabel("Nama pelanggan").fill(`Warung ${run}`);
    await settle.getByRole("button", { name: "Simpan setoran" }).click();
    await expectResult(page, /Setoran sudah dicatat\. Transaksi INV-\d{8}-\d{4} dibuat\./);

    const row = balance.getByRole("row", { name: new RegExp(product) });
    await expect(row.getByRole("cell")).toHaveText([product, "7", "4", "1", "2"]);
    await expect(historyLine("4 terjual")).toHaveCount(1);
    await expect(historyLine("1 dikembalikan")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Transaksi INV-/ }).first()).toBeVisible();

    await page.getByRole("link", { name: "Setor" }).click();
    const rest = page.getByRole("dialog", { name: "Setor hasil penjualan" });
    await rest.getByLabel(`Dikembalikan, ${product}`).fill("2");
    await expect(rest).toContainText("Tidak ada yang terjual, hanya barang yang dikembalikan.");
    await rest.getByRole("button", { name: "Simpan setoran" }).click();
    await expectResult(page, "Barang yang dikembalikan sudah dicatat.");
    await expect(row.getByRole("cell")).toHaveText([product, "7", "4", "3", "0"]);
    await page.context().close();
  });

  test("the owner sees the salesperson's goods and the stock back on the shelf", async ({
    page,
  }) => {
    await page.goto("/id/consignments");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sales");
    await page.goto(`/id/stock?q=${sku}`);
    await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText("16");
  });
});
