import AxeBuilder from "@axe-core/playwright";

import { accounts } from "./accounts";
import { expect, test } from "./fixtures";
import { cashierAtPos, expectResult } from "./helpers";

test.describe("cashier shifts (FR-SHF, ADR-0044)", () => {
  test.describe.configure({ mode: "serial" });

  test("opens the store shift and another cashier carries on in it", async ({ page, browser }) => {
    await page.goto("/id/pos");
    /** Earlier runs may have left store shifts open; close each one. */
    for (let open = 0; open < 5; open += 1) {
      if (!(await page.getByRole("link", { name: "Tutup shift" }).isVisible())) break;
      await page.goto("/id/pos?close=1");
      await page.getByLabel("Kas fisik").fill("0");
      await page.getByRole("button", { name: "Tutup shift" }).click();
      await expect(page).toHaveURL(/\/id\/pos\/shifts\?view=[0-9a-f-]+$/);
      await page.goto("/id/pos");
    }

    await page.getByLabel("Modal awal kas").fill("abc");
    await page.getByRole("button", { name: "Buka shift" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Format tidak valid.")).toBeVisible();
    await page.getByLabel("Modal awal kas").fill("200.000");
    await page.getByLabel("Catatan modal awal").fill("Uang kecil di amplop");
    await page.getByRole("button", { name: "Buka shift" }).click();
    await expect(
      page.getByText(new RegExp(`^Shift toko sejak .* · dibuka ${accounts.owner.name}$`)),
    ).toBeVisible();

    const cashier = await cashierAtPos(browser);
    await expect(cashier.getByRole("button", { name: "Buka shift" })).toHaveCount(0);
    await expect(
      cashier.getByText(new RegExp(`^Shift toko sejak .* · dibuka ${accounts.owner.name}$`)),
    ).toBeVisible();
    await cashier.context().close();
  });

  test("closes the shared shift with a recorded variance and who closed it", async ({ page }) => {
    await page.goto("/id/pos");
    await page.getByRole("link", { name: "Tutup shift" }).click();
    const dialog = page.getByRole("dialog", { name: "Tutup shift" });
    await expect(dialog.getByText(/Rp\s200\.000/).first()).toBeVisible();
    await expect(dialog).toContainText("Uang kecil di amplop");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    /** Expected cash includes whatever the last drawer shift left behind (ADR-0032). */
    const expected = await dialog
      .getByText("Kas seharusnya", { exact: true })
      .locator("..")
      .innerText();
    const amount = Number((/Rp\s*([\d.]+)/.exec(expected)?.[1] ?? "0").replaceAll(".", ""));
    await page.getByLabel("Kas fisik").fill(String(amount - 10_000));
    await page.getByLabel("Catatan").fill("Selisih uji");
    await page.getByRole("button", { name: "Tutup shift" }).click();
    await expect(page).toHaveURL(/\/id\/pos\/shifts\?view=[0-9a-f-]+$/);
    const report = page.getByRole("dialog", { name: "Laporan shift" });
    await expect(report.getByText(/Kurang Rp\s10\.000/)).toBeVisible();
    await expect(report.getByText("Selisih uji")).toBeVisible();
    await expect(report.getByText(`Ditutup oleh ${accounts.owner.name}`)).toBeVisible();
  });

  test("lists store shifts and sales shifts apart", async ({ page }) => {
    await page.goto("/id/pos/shifts");
    const tabs = page.getByRole("navigation", { name: "Jenis shift" });
    await expect(tabs.getByRole("link", { name: "Shift toko" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const first = page
      .getByRole("table", { name: "Riwayat shift, terbaru di atas" })
      .getByRole("row")
      .nth(1);
    await expect(first).toContainText("Selesai");
    await expect(first).toContainText(/Kurang Rp\s10\.000/);
    await expect(first).toContainText(accounts.owner.name);

    await tabs.getByRole("link", { name: "Shift sales" }).click();
    await expect(page).toHaveURL(/kind=SALES/);
    await expect(page.getByRole("columnheader", { name: "Modal awal" })).toHaveCount(0);
  });
});
