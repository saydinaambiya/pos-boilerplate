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
    await page.getByRole("link", { name: "Bulan ini" }).click();
    await expect(page.getByRole("link", { name: "Bulan ini" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByText("Laba kotor kasir")).toBeVisible();
    for (const section of ["Per hari", "Per metode pembayaran", "Per produk", "PPN & service"]) {
      await expect(page.getByRole("heading", { name: section, level: 2 })).toBeVisible();
    }

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
    await page.getByLabel("Password atau PIN").fill("123456");
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
