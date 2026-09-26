import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures";

test.describe("cashier shifts (FR-SHF)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful shift flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("opens a shift and closes it with a recorded variance", async ({ page }) => {
    await page.goto("/id/pos");
    if (await page.getByRole("link", { name: "Tutup shift" }).isVisible()) {
      await page.goto("/id/pos/shift/close");
      await page.getByLabel("Kas fisik").fill("0");
      await page.getByRole("button", { name: "Tutup shift" }).click();
      await expect(page).toHaveURL(/\/id\/pos\/shifts\/[0-9a-f-]+$/);
      await page.goto("/id/pos");
    }

    await page.getByLabel("Modal awal kas").fill("abc");
    await page.getByRole("button", { name: "Buka shift" }).click();
    await expect(page.getByText("Format tidak valid.")).toBeVisible();
    await page.getByLabel("Modal awal kas").fill("200.000");
    await page.getByRole("button", { name: "Buka shift" }).click();
    await expect(page.getByRole("heading", { name: "Shift berjalan" })).toBeVisible();
    await expect(page.getByText(/Rp\s200\.000/).first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("link", { name: "Tutup shift" }).click();
    await page.getByLabel("Kas fisik").fill("190.000");
    await page.getByLabel("Catatan").fill("Selisih uji");
    await page.getByRole("button", { name: "Tutup shift" }).click();
    await expect(page).toHaveURL(/\/id\/pos\/shifts\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Laporan shift" })).toBeVisible();
    await expect(page.getByText(/Kurang Rp\s10\.000/)).toBeVisible();
    await expect(page.getByText("Selisih uji")).toBeVisible();
  });

  test("lists the shift in the history", async ({ page }) => {
    await page.goto("/id/pos/shifts");
    const first = page
      .getByRole("table", { name: "Riwayat shift, terbaru di atas" })
      .getByRole("row")
      .nth(1);
    await expect(first).toContainText("Selesai");
    await expect(first).toContainText(/Kurang Rp\s10\.000/);
  });
});
