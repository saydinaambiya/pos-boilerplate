import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";
import { choose, expectResult } from "./helpers";

test.describe("dashboard and sales report (FR-DSH-01, FR-RPT)", () => {
  test("the dashboard shows today's figures and online order chips", async ({ page }) => {
    await page.goto("/id/dashboard");
    const today = page.getByRole("region", { name: "Ringkasan hari ini" });
    await expect(today).toContainText("Penjualan hari ini");
    await expect(today).toContainText("Transaksi hari ini");
    await expect(page.getByRole("list", { name: "Pesanan online" })).toContainText("Diproses");
  });

  test("the recap shows money in and the drawer, by day and by month, with details", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "downloads are checked once, on desktop");
    await page.goto("/id/reports");
    await expect(page.getByRole("link", { name: "Harian" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const heading of ["Uang masuk", "Kas tunai"]) {
      await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
    }
    for (const term of ["Ke rekening", "Tunai di kasir", "Disetor ke ATM", "Sisa di laci"]) {
      await expect(page.getByRole("term").filter({ hasText: term })).toBeVisible();
    }
    await expect(page.getByText("Laba kotor kasir")).toHaveCount(0);

    await page.getByRole("link", { name: "Hari sebelumnya" }).click();
    await expect(page).toHaveURL(/[?&]day=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByRole("link", { name: "Hari berikutnya" })).toBeVisible();

    /**
     * The report is the heaviest page, so its navigation gets more time
     * under parallel load.
     */
    await page.getByRole("link", { name: "Bulanan" }).click();
    await expect(page).toHaveURL(/[?&]month=\d{4}-\d{2}/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Per hari", level: 2 })).toBeVisible();
    await expect(page.getByText("Sisa dari bulan sebelumnya")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Per produk", level: 2 })).toBeHidden();
    await page.getByText("Rincian lainnya").click();
    for (const section of [
      "Per metode pembayaran",
      "Pengeluaran harian",
      "Per produk",
      "Per merk",
      "PPN & service",
    ]) {
      await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    }

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Unduh CSV Per produk" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      /^rekap-products-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const content = await readFile(await file.path(), "utf8");
    expect(content.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe(
      "Produk,Qty,Diskon item,Penjualan",
    );
  });

  test("records, corrects and cancels a cash deposit with reasons (FR-RPT-07)", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "stateful deposit flows run once, on desktop");
    const run = Date.now().toString();
    const bank = `Setor ${run.slice(-6)}`;
    const accountNo = run.slice(-10);
    await page.goto("/id/settings/bank-accounts");
    await page.getByLabel("Nama bank").fill(bank);
    await page.getByLabel("Nomor rekening").fill(accountNo);
    await page.getByLabel("Atas nama").fill("Toko Contoh");
    await page.getByRole("button", { name: "Tambah rekening" }).click();
    await expect(page.getByRole("row", { name: new RegExp(bank) })).toBeVisible();

    await page.goto("/id/reports");
    await page.getByRole("link", { name: "Catat setoran" }).click();
    const dialog = page.getByRole("dialog", { name: "Catat setoran tunai" });
    await expect(dialog).toContainText("yang diterima mesin ATM");
    await choose(dialog, "Rekening tujuan", `${bank} ${accountNo}`);
    await dialog.getByLabel("Jumlah disetor").fill("150.000");
    await dialog.getByRole("button", { name: "Simpan setoran" }).click();
    await expect(dialog).toBeHidden();

    const deposits = page.getByRole("list", { name: "Setoran tunai" });
    const entry = deposits.getByRole("listitem").filter({ hasText: bank });
    await expect(entry).toContainText(/Rp\s?150\.000/);

    await entry.getByRole("link", { name: /^Ubah setoran/ }).click();
    const edit = page.getByRole("dialog", { name: /^Ubah setoran/ });
    await edit.getByLabel("Jumlah disetor").fill("140.000");
    await edit.getByRole("button", { name: "Simpan perubahan" }).click();
    await expectResult(page, /./, "error");
    await expect(edit.getByText("Wajib diisi.")).toBeVisible();
    await edit.getByLabel("Alasan").fill("Salah ketik jumlah");
    await edit.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(edit).toBeHidden();
    await expect(entry).toContainText(/Rp\s?140\.000/);
    await entry.getByText("Riwayat perubahan (1)").click();
    await expect(entry).toContainText(/Jumlah Rp\s?150\.000 → Rp\s?140\.000/);
    await expect(entry).toContainText("Alasan: Salah ketik jumlah");

    await entry.getByRole("button", { name: "Batalkan" }).click();
    const confirm = page.getByRole("dialog", { name: /^Batalkan setoran/ });
    await confirm.getByLabel("Alasan").fill("Tidak jadi disetor");
    await confirm.getByRole("button", { name: "Ya, batalkan" }).click();
    await expectResult(page, "Setoran dibatalkan.");
    await expect(entry).toContainText("Dibatalkan");
  });

  test("an employee without report access is refused", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/id/login");
    await page.getByLabel("Username").fill("kasir");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await page.getByLabel(/^(Password|PIN)$/).fill("123456");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/id$/);
    await expect(page.getByRole("region", { name: "Ringkasan hari ini" })).toHaveCount(0);
    const response = await page.goto("/id/reports");
    expect(response?.status()).toBe(403);
    const csv = await page.request.get("/api/v1/reports/daily");
    expect(csv.status()).toBe(403);
    await context.close();
  });
});
