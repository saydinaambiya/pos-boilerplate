import { expect, test } from "./fixtures";

test.describe("housekeeping (FR-HK)", () => {
  test("explains the retention rule and hides archived rows by default", async ({ page }) => {
    await page.goto("/id/housekeeping");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Housekeeping");
    await expect(page.getByText(/minimal berumur \d+ bulan/)).toBeVisible();
    const meter = page.getByRole("meter", { name: "Kapasitas database" });
    await expect(meter).toHaveAttribute("aria-valuetext", /terpakai/);
    await expect(
      page.getByRole("list", { name: "Data yang paling banyak memakai ruang" }),
    ).toBeVisible();

    await page.goto("/id/online-orders");
    const toggle = page.getByLabel("Tampilkan data arsip");
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await page.getByRole("button", { name: "Cari" }).click();
    await expect(page).toHaveURL(/archived=1/);
    await expect(page.getByLabel("Tampilkan data arsip")).toBeChecked();
  });

  test("a month that is too recent cannot be downloaded", async ({ page }) => {
    const response = await page.request.get("/api/v1/housekeeping/2099-01");
    expect(response.status()).toBe(404);
  });
});
