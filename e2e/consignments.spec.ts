import type { Locator } from "@playwright/test";

import { accounts, E2E_BRAND } from "./accounts";
import { expect, test } from "./fixtures";
import {
  cashierAtPos,
  choose,
  createStockedProduct,
  expectResult,
  grantEmployeePermission,
  pick,
} from "./helpers";

/** Names are unique per run because the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Keripik Sales ${run}`;
const sku = `SALES-${run}`.toUpperCase();
const item = `${product} · Red · 93cm x 47cm`;
/** The item with its brand beside it and its motif, as forms list it (FR-CSG-08, FR-PRD-08). */
const withMotif = `${E2E_BRAND} · ${product} · Nappa · Red · 93cm x 47cm`;
/** The item without its colour, as the balance table and the history name it. */
const goods = `${product} · 93cm x 47cm`;
/** The item in the dated history, with its brand beside it (FR-CSG-08, FR-PRD-08). */
const historyGoods = `${E2E_BRAND} · ${goods}`;
/** The line under each history item (FR-CSG-08). */
const details = "Motif: Nappa · Warna: Red";
/** The colour's roll, carried by the meter (FR-CSG-09). */
const rollItem = `${E2E_BRAND} · ${product} · Nappa · Red · Roll`;

/** Searches the goods still carried and picks one before its amount is entered (FR-CSG-09). */
async function pickGoods(dialog: Locator, label: string) {
  await pick(dialog, "Pilih barang", label, product);
}

test.describe("field sales goods (FR-CSG-01..08, ADR-0024)", () => {
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
    await grantEmployeePermission(page, "Diskon manual per item di kasir dan Sales");
    await page.goto("/id/settings/bank-accounts");
    await page.getByLabel("Nama bank").fill(`Sales ${run}`);
    await page.getByLabel("Nomor rekening").fill(Date.now().toString().slice(-10));
    await page.getByLabel("Atas nama").fill("Toko Contoh");
    await page.getByRole("button", { name: "Tambah rekening" }).click();
    await expect(page.getByRole("row", { name: new RegExp(`Sales ${run}`) })).toBeVisible();
  });

  test("the store records goods a salesperson takes on two visits", async ({ page }) => {
    await page.goto("/id/consignments?take=1");
    const take = page.getByRole("dialog", { name: "Ambil barang" });
    await choose(take, "Sales", accounts.posCashier.name);
    await take.getByRole("searchbox").fill(product);
    await take
      .getByRole("button", { name: `Tambah ${E2E_BRAND} · ${product} — Nappa · Red · 93cm x 47cm` })
      .click();
    await take.getByLabel(`Jumlah ${E2E_BRAND} · ${product}`).fill("5");
    await take.getByRole("button", { name: "Simpan barang dibawa" }).click();
    await expectResult(page, "Barang yang dibawa sudah dicatat.");
    await expect(page).toHaveURL(/\/id\/consignments\/[0-9a-f-]+$/);
    consignmentUrl = new URL(page.url()).pathname;
    const balance = page.getByRole("table", { name: "Ringkasan per barang" });
    await expect(balance.getByRole("row", { name: new RegExp(goods) })).toContainText("5");

    await page.getByRole("link", { name: "Tambah barang" }).click();
    const more = page.getByRole("dialog", { name: "Ambil barang" });
    await more.getByRole("searchbox").fill(product);
    await more
      .getByRole("button", { name: `Tambah ${E2E_BRAND} · ${product} — Nappa · Red · 93cm x 47cm` })
      .click();
    await more.getByLabel(`Jumlah ${E2E_BRAND} · ${product}`).fill("2");
    await more.getByRole("button", { name: "Simpan barang dibawa" }).click();
    await expectResult(page, "Barang yang dibawa sudah dicatat.");
    await expect(balance.getByRole("row", { name: new RegExp(goods) })).toContainText("7");
  });

  test("pickup staff take off goods entered by mistake", async ({ page }) => {
    await page.goto(consignmentUrl);
    await page.getByRole("link", { name: "Kurangi barang", exact: true }).click();
    const reduce = page.getByRole("dialog", { name: "Kurangi barang bawaan" });
    await pickGoods(reduce, withMotif);
    await reduce.getByLabel(`Dikurangi, ${withMotif}`).fill("8");
    await reduce.getByRole("button", { name: "Simpan pengurangan" }).click();
    await expect(reduce.getByRole("alert")).toContainText("lebih dari 7 yang masih dibawa");
    await reduce.getByLabel(`Dikurangi, ${withMotif}`).fill("1");
    await reduce.getByRole("button", { name: "Simpan pengurangan" }).click();
    await expectResult(page, "Barang bawaan sudah dikurangi.");
    const row = page
      .getByRole("table", { name: "Ringkasan per barang" })
      .getByRole("row", { name: new RegExp(goods) });
    await expect(row.getByRole("cell")).toHaveText([
      E2E_BRAND,
      goods,
      "Nappa",
      "Red",
      "6",
      "0",
      "0",
      "6",
    ]);
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: new RegExp(`^${historyGoods}\\s*${details}\\s*1 dikurangi$`) }),
    ).toHaveCount(1);
  });

  test("the salesperson only sees their goods and records what sold", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.goto(consignmentUrl);
    await expect(page.getByRole("link", { name: "Tambah barang" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Catat pengembalian" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Kurangi barang", exact: true })).toHaveCount(0);
    /** One line of the dated history: the item and what happened to it. */
    const historyLine = (what: string) =>
      page
        .getByRole("listitem")
        .filter({ hasText: new RegExp(`^${historyGoods}\\s*${details}\\s*${what}$`) });
    await expect(historyLine("5 diambil")).toHaveCount(1);
    await expect(historyLine("2 diambil")).toHaveCount(1);
    await expect(historyLine("1 dikurangi")).toHaveCount(1);

    await page.getByRole("link", { name: "Catat terjual" }).click();
    const sell = page.getByRole("dialog", { name: "Catat barang terjual" });
    await pickGoods(sell, withMotif);
    await expect(sell.getByLabel(`Dikembalikan, ${withMotif}`)).toHaveCount(0);
    await sell.getByLabel(`Terjual, ${withMotif}`).fill("4");
    /** A line discount like at the cashier (FR-CSG-04, FR-POS-02). */
    await sell.getByRole("button", { name: `Diskon untuk ${withMotif}` }).click();
    const discount = sell.getByRole("group", { name: `Diskon untuk ${withMotif}` });
    await discount.getByLabel("Nilai diskon").fill("10");
    await discount.getByRole("button", { name: "Terapkan" }).click();
    await expect(sell.getByText(/^Diskon −Rp/)).toBeVisible();
    await expect(sell.getByText("Diskon item")).toBeVisible();
    await sell.getByLabel("Nama pelanggan").fill(`Warung ${run}`);
    /** Part cash, the rest by transfer (ADR-0033); the label names QRIS once a QRIS account exists. */
    await sell.getByLabel(/^Tunai \+/).check({ force: true });
    await sell.getByLabel("Tunai diterima").fill("50.000");
    await sell.getByRole("button", { name: "Simpan barang terjual" }).click();
    await expect(sell.getByText(/Isi jumlah tunai lebih dari 0/)).toBeVisible();
    await sell.getByLabel("Tunai diterima").fill("5.000");
    await expect(sell.getByText(/^Sisanya Rp\s?[\d.]+ lewat transfer\/QRIS$/)).toBeVisible();
    await sell.getByRole("button", { name: "Simpan barang terjual" }).click();
    await expectResult(page, /Barang terjual sudah dicatat\. Transaksi INV-\d{8}-\d{4} dibuat\./);

    const row = page
      .getByRole("table", { name: "Ringkasan per barang" })
      .getByRole("row", { name: new RegExp(goods) });
    await expect(row.getByRole("cell")).toHaveText([
      E2E_BRAND,
      goods,
      "Nappa",
      "Red",
      "6",
      "4",
      "0",
      "2",
    ]);
    await expect(historyLine("4 terjual")).toHaveCount(1);

    /** The full invoice opens right over the goods (FR-CSG-10). */
    const invoiceLink = page.getByRole("link", { name: /Transaksi INV-/ }).first();
    const invoiceNo = ((await invoiceLink.textContent()) ?? "").replace("Transaksi ", "");
    await invoiceLink.click();
    const receipt = page.getByRole("dialog", { name: `Struk ${invoiceNo}` });
    await expect(receipt.getByRole("table", { name: "Item transaksi" })).toContainText(product);
    await expect(receipt.getByRole("link", { name: "Cetak / PDF" })).toBeVisible();
    await receipt.getByRole("button", { name: "Tutup" }).first().click();

    /** The salesperson's sales sit in their own tab, like the cashier's history (FR-CSG-10). */
    await page.goto("/consignments/sales");
    await expect(page.getByRole("link", { name: "Riwayat transaksi" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByLabel("Sales", { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: `Buka transaksi ${invoiceNo}` }).click();
    await expect(page.getByRole("dialog", { name: `Struk ${invoiceNo}` })).toBeVisible();
    await page.context().close();
  });

  test("the shop floor records returned goods and stock is back on the shelf", async ({ page }) => {
    await page.goto(consignmentUrl);
    await page.getByRole("link", { name: "Catat pengembalian" }).click();
    const back = page.getByRole("dialog", { name: "Catat barang dikembalikan" });
    await pickGoods(back, withMotif);
    await expect(back.getByLabel(`Terjual, ${withMotif}`)).toHaveCount(0);
    await back.getByLabel(`Dikembalikan, ${withMotif}`).fill("2");
    await back.getByRole("button", { name: "Simpan barang dikembalikan" }).click();
    await expectResult(page, "Barang yang dikembalikan sudah dicatat.");
    const row = page
      .getByRole("table", { name: "Ringkasan per barang" })
      .getByRole("row", { name: new RegExp(goods) });
    await expect(row.getByRole("cell")).toHaveText([
      E2E_BRAND,
      goods,
      "Nappa",
      "Red",
      "6",
      "4",
      "2",
      "0",
    ]);

    await page.goto(`/id/stock?q=${sku}`);
    await expect(page.getByRole("row", { name: new RegExp(item) })).toContainText("16");
  });

  test("a salesperson carries a roll by the meter and sells part of it (FR-CSG-09)", async ({
    page,
    browser,
  }) => {
    test.slow();
    await page.goto("/id/consignments?take=1");
    const take = page.getByRole("dialog", { name: "Ambil barang" });
    await choose(take, "Sales", accounts.posCashier.name);
    await take.getByRole("searchbox").fill(product);
    const rollButton = `${E2E_BRAND} · ${product} — Nappa · Red · Roll`;
    await take.getByRole("button", { name: `Tambah ${rollButton}` }).click();
    await take.getByRole("button", { name: "Simpan barang dibawa" }).click();
    await expect(take.getByRole("alert")).toContainText(`Isi jumlah untuk ${rollButton}`);
    await take.getByLabel(`Meter ${rollButton}`).fill("3,5");
    await take.getByRole("button", { name: "Simpan barang dibawa" }).click();
    await expectResult(page, "Barang yang dibawa sudah dicatat.");
    await expect(page).toHaveURL(/\/id\/consignments\/[0-9a-f-]+$/);
    const rollUrl = new URL(page.url()).pathname;
    const rollRow = page
      .getByRole("table", { name: "Ringkasan per barang" })
      .getByRole("row", { name: new RegExp(`${product} · Roll`) });
    await expect(rollRow.getByRole("cell").nth(7)).toHaveText("3,5m");

    const sales = await cashierAtPos(browser);
    await sales.goto(rollUrl);
    await sales.getByRole("link", { name: "Catat terjual" }).click();
    const sell = sales.getByRole("dialog", { name: "Catat barang terjual" });
    await pickGoods(sell, rollItem);
    await sell.getByLabel(`Terjual, ${rollItem}`).fill("1,5");
    await expect(sell).toContainText("Rp 5.000 / m · Masih dibawa 3,5m");
    await sell.getByLabel("Nama pelanggan").fill(`Toko Meter ${run}`);
    await sell.getByRole("button", { name: "Simpan barang terjual" }).click();
    await expectResult(sales, /Barang terjual sudah dicatat\. Transaksi INV-\d{8}-\d{4} dibuat\./);
    const soldRow = sales
      .getByRole("table", { name: "Ringkasan per barang" })
      .getByRole("row", { name: new RegExp(`${product} · Roll`) });
    await expect(soldRow.getByRole("cell").nth(5)).toHaveText("1,5m");
    await expect(soldRow.getByRole("cell").nth(7)).toHaveText("2m");
    await sales.context().close();
  });
});
