import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { choose, expectResult } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36).toUpperCase();
const company = `Supplier ${run}`;
const invoice = `PB-${run}`;
const cashCompany = `Tunai ${run}`;
const cashInvoice = `PT-${run}`;

const rupiah = (text: string) => Number(text.replace(/\D/g, ""));
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

async function setDate(dialog: Locator, name: string, value: string) {
  await dialog.locator(`input[name="${name}"]`).evaluate((node, v) => {
    const input = node as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/** A list row for a supplier bill, matched by company name. */
function row(page: Page, name: string) {
  return page.getByRole("row", { name: new RegExp(name) });
}

/** The value of one `<dt>`/`<dd>` row of the summary inside a scope. */
function summaryValue(scope: Locator, term: string) {
  return scope
    .locator("dl > div", { hasText: new RegExp(`^${term}`) })
    .locator("dd")
    .first();
}

test.describe("supplier purchases (FR-PRB, ADR-0053)", () => {
  test.skip(({ isMobile }) => isMobile, "the stateful purchase flow runs once, on desktop");

  test("records a credit bill and its installments from the list, staying on the list", async ({
    page,
  }) => {
    await page.goto("/id/purchases");
    await page.getByRole("link", { name: "Tambah pembelian" }).click();
    const dialog = page.getByRole("dialog", { name: "Tambah pembelian" });
    await dialog.getByLabel("Nama Perusahaan").fill(company);
    await dialog.getByLabel("Nota Faktur").fill(invoice);
    await dialog.getByLabel("Total Tagihan").fill("1.000.000");
    await dialog
      .getByRole("group", { name: "Pembayaran" })
      .getByText("Cicil", { exact: true })
      .click();
    await setDate(dialog, "orderDate", daysAgo(30));
    await setDate(dialog, "dueDate", daysAgo(5));
    await dialog.getByRole("button", { name: "Simpan pembelian" }).click();

    await expectResult(page, "Pembelian disimpan.");
    await expect(page).toHaveURL(/\/id\/purchases$/);
    const bill = row(page, company);
    await expect(bill).toContainText("Belum dibayar");
    await expect(bill).toContainText("Terlewat");
    await expect(bill).toContainText(/Rp\s1\.000\.000/);

    await bill.getByRole("link", { name: "Buka pembelian" }).click();
    const sheet = page.getByRole("dialog", { name: `Cicilan ${company}` });
    await expect(page).toHaveURL(/\/id\/purchases\?bill=/);
    expect(rupiah(await summaryValue(sheet, "Sisa").innerText())).toBe(1_000_000);

    await sheet.getByLabel("Nominal").fill("400.000");
    await sheet.getByRole("button", { name: "Catat cicilan" }).click();
    await expectResult(page, "Cicilan dicatat.");
    await expect(sheet).toContainText("Dicicil");
    expect(rupiah(await summaryValue(sheet, "Sisa").innerText())).toBe(600_000);

    await sheet.getByRole("link", { name: "Hapus cicilan" }).click();
    await page
      .getByRole("dialog", { name: "Hapus cicilan ini?" })
      .getByRole("button", { name: "Hapus cicilan" })
      .click();
    await expectResult(page, "Cicilan dihapus.");
    await expect(sheet).toContainText("Belum dibayar");
    expect(rupiah(await summaryValue(sheet, "Sisa").innerText())).toBe(1_000_000);

    await sheet.getByLabel("Nominal").fill("400.000");
    await sheet.getByRole("button", { name: "Catat cicilan" }).click();
    await expectResult(page, "Cicilan dicatat.");
    await sheet.getByLabel("Nominal").fill("600.000");
    await sheet.getByRole("button", { name: "Catat cicilan" }).click();
    await expectResult(page, "Cicilan dicatat.");
    await expect(sheet).toContainText("Lunas");
    expect(rupiah(await summaryValue(sheet, "Sisa").innerText())).toBe(0);

    await sheet.getByRole("button", { name: "Tutup" }).click();
    await expect(page).toHaveURL(/\/id\/purchases$/);
    await choose(page, "Filter", "Lunas");
    await expect(page.getByRole("table")).toContainText(invoice);
  });

  test("edits and deletes a fully paid bill from the list", async ({ page }) => {
    await page.goto("/id/purchases");
    await page.getByRole("link", { name: "Tambah pembelian" }).click();
    const dialog = page.getByRole("dialog", { name: "Tambah pembelian" });
    await dialog.getByLabel("Nama Perusahaan").fill(cashCompany);
    await dialog.getByLabel("Nota Faktur").fill(cashInvoice);
    await dialog.getByLabel("Total Tagihan").fill("250.000");
    await setDate(dialog, "orderDate", daysAgo(10));
    await dialog.getByRole("button", { name: "Simpan pembelian" }).click();

    await expectResult(page, "Pembelian disimpan.");
    await expect(page).toHaveURL(/\/id\/purchases$/);
    await expect(row(page, cashCompany)).toContainText("Lunas");

    await row(page, cashCompany).getByRole("link", { name: "Ubah" }).click();
    const edit = page.getByRole("dialog", { name: "Ubah pembelian" });
    await edit.getByLabel("Nama Perusahaan").fill(`${cashCompany} Jaya`);
    await edit.getByRole("button", { name: "Simpan pembelian" }).click();
    await expectResult(page, "Pembelian disimpan.");
    await expect(page).toHaveURL(/\/id\/purchases$/);
    await expect(row(page, `${cashCompany} Jaya`)).toBeVisible();

    await row(page, `${cashCompany} Jaya`).getByRole("link", { name: "Hapus" }).click();
    await page
      .getByRole("dialog", { name: "Hapus pembelian" })
      .getByRole("button", { name: "Hapus" })
      .click();
    await expectResult(page, "Pembelian dihapus.");
    await expect(page).toHaveURL(/\/id\/purchases$/);
    await expect(row(page, cashCompany)).toHaveCount(0);
  });
});
