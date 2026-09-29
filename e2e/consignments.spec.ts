import { accounts } from "./accounts";
import { expect, test } from "./fixtures";
import {
  cashierAtPos,
  choose,
  createStockedProduct,
  expectResult,
  grantEmployeePermission,
} from "./helpers";

/** Names are unique per run because the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Keripik Sales ${run}`;
const sku = `SALES-${run}`.toUpperCase();
const item = `${product} · Red · 93cm x 47cm`;

test.describe("field sales goods (FR-CSG-01..05, ADR-0024)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful consignment flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  let consignmentUrl = "";

  test("prepares stock and makes employees salespeople", async ({ page }) => {
    await createStockedProduct(page, {
      name: product,
      sku,
      price: "5000",
      stock: "20",
    });
    await grantEmployeePermission(page, "Halaman Sales (barang bawaan sales)");
    await grantEmployeePermission(page, "Sales: jual barang bawaan sendiri");
  });

  test("the store records goods a salesperson takes on two visits", async ({ page }) => {
    await page.goto("/id/consignments?take=1");
    const take = page.getByRole("dialog", { name: "Ambil barang" });
    await choose(take, "Sales", accounts.posCashier.name);
    await take.getByRole("searchbox").fill(product);
    await take.getByRole("button", { name: `Tambah ${product} — Red · 93cm x 47cm` }).click();
    await take.getByLabel(`Jumlah ${product}`).fill("5");
    await take.getByRole("button", { name: "Simpan barang dibawa" }).click();
    await expectResult(page, "Barang yang dibawa sudah dicatat.");
    await expect(page).toHaveURL(/\/id\/consignments\/[0-9a-f-]+$/);
    consignmentUrl = new URL(page.url()).pathname;
    const balance = page.getByRole("table", { name: "Ringkasan per barang" });
    await expect(balance.getByRole("row", { name: new RegExp(item) })).toContainText("5");

    await page.getByRole("link", { name: "Tambah barang" }).click();
    const more = page.getByRole("dialog", { name: "Ambil barang" });
    await more.getByRole("searchbox").fill(product);
    await more.getByRole("button", { name: `Tambah ${product} — Red · 93cm x 47cm` }).click();
    await more.getByLabel(`Jumlah ${product}`).fill("2");
    await more.getByRole("button", { name: "Simpan barang dibawa" }).click();
    await expectResult(page, "Barang yang dibawa sudah dicatat.");
    await expect(balance.getByRole("row", { name: new RegExp(item) })).toContainText("7");
  });

  test("the salesperson only sees their goods and records what sold", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.goto(consignmentUrl);
    await expect(page.getByRole("link", { name: "Tambah barang" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Catat pengembalian" })).toHaveCount(0);
    /** One line of the dated history: the item and what happened to it. */
    const historyLine = (what: string) =>
      page.getByRole("listitem").filter({ hasText: new RegExp(`^${item}\\s*${what}$`) });
    await expect(historyLine("5 diambil")).toHaveCount(1);
    await expect(historyLine("2 diambil")).toHaveCount(1);

    await page.getByRole("link", { name: "Catat terjual" }).click();
    const sell = page.getByRole("dialog", { name: "Catat barang terjual" });
    await expect(sell.getByLabel(`Dikembalikan, ${item}`)).toHaveCount(0);
    await sell.getByLabel(`Terjual, ${item}`).fill("4");
    await sell.getByLabel("Nama pelanggan").fill(`Warung ${run}`);
    await sell.getByRole("button", { name: "Simpan barang terjual" }).click();
    await expectResult(page, /Barang terjual sudah dicatat\. Transaksi INV-\d{8}-\d{4} dibuat\./);

    const row = page
      .getByRole("table", { name: "Ringkasan per barang" })
      .getByRole("row", { name: new RegExp(item) });
    await expect(row.getByRole("cell")).toHaveText([item, "7", "4", "0", "3"]);
    await expect(historyLine("4 terjual")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Transaksi INV-/ }).first()).toBeVisible();
    await page.context().close();
  });

  test("the shop floor records returned goods and stock is back on the shelf", async ({ page }) => {
    await page.goto(consignmentUrl);
    await page.getByRole("link", { name: "Catat pengembalian" }).click();
    const back = page.getByRole("dialog", { name: "Catat barang dikembalikan" });
    await expect(back.getByLabel(`Terjual, ${item}`)).toHaveCount(0);
    await back.getByLabel(`Dikembalikan, ${item}`).fill("3");
    await back.getByRole("button", { name: "Simpan barang dikembalikan" }).click();
    await expectResult(page, "Barang yang dikembalikan sudah dicatat.");
    const row = page
      .getByRole("table", { name: "Ringkasan per barang" })
      .getByRole("row", { name: new RegExp(item) });
    await expect(row.getByRole("cell")).toHaveText([item, "7", "4", "3", "0"]);

    await page.goto(`/id/stock?q=${sku}`);
    await expect(page.getByRole("row", { name: new RegExp(item) })).toContainText("16");
  });
});
