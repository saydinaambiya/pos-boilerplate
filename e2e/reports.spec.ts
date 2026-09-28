import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";

test.describe("dashboard and sales report (FR-DSH-01, FR-RPT)", () => {
  test("the dashboard shows today's figures and online order chips", async ({ page }) => {
    await page.goto("/id");
    const today = page.getByRole("region", { name: "Ringkasan hari ini" });
    await expect(today).toContainText("Penjualan hari ini");
    await expect(today).toContainText("Transaksi hari ini");
    await expect(page.getByRole("list", { name: "Pesanan online" })).toContainText("Diproses");
  });

  test("the report shows sections with profit and exports CSV", async ({ page, isMobile }) => {
    test.skip(isMobile, "downloads are checked once, on desktop");
    await page.goto("/id/reports");
    /**
     * The default range is already "this month", so `aria-current` holds
     * before the click lands. Wait for the URL instead, or the filter form
     * remounts under the date picker opened below. The report is the
     * heaviest page, so its navigation gets more time under parallel load.
     */
    const thisMonth = page.getByRole("link", { name: "Bulan ini" });
    await thisMonth.click();
    await expect(page).toHaveURL(/[?&]from=\d{4}-\d{2}-\d{2}&to=/, { timeout: 15_000 });
    await expect(thisMonth).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Laba kotor kasir")).toBeVisible();
    for (const section of [
      "Per hari",
      "Per metode pembayaran",
      "Per produk",
      "Per merk",
      "PPN & service",
    ]) {
      await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    }

    const from = page.locator('input[name="from"]');
    const before = await from.inputValue();
    await page.getByLabel("Dari", { exact: true }).click();
    await expect(page.getByRole("grid")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("grid")).toBeHidden();
    await expect(from).not.toHaveValue(before);
    await expect(from).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page).toHaveURL(new RegExp(`from=${await from.inputValue()}`));

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Unduh CSV Per produk" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      /^rekap-products-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const content = await readFile(await file.path(), "utf8");
    expect(content.replace(/^﻿/, "").split("\r\n")[0]).toBe(
      "Produk,Qty,Diskon item,Penjualan,Modal,Margin",
    );
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
