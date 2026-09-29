import { accounts } from "./accounts";
import { expect, test } from "./fixtures";
import { cashierAtPos, choose, expectResult, grantEmployeePermission } from "./helpers";

/** Unique notes per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);

test.describe("daily staff expenses (FR-EXP-01..03)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful expense flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("lets employees record expenses", async ({ page }) => {
    await grantEmployeePermission(page, "Halaman pengeluaran harian");
    await grantEmployeePermission(page, "Catat pengeluaran harian dari kas");
  });

  test("a cashier pays a meal allowance and a donation from the drawer", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.goto("/id/pos?close=1");
    const paidBefore = await page
      .getByText("Pengeluaran dari kas", { exact: true })
      .locator("..")
      .innerText();

    await page.goto("/id/expenses?new=1");
    const dialog = page.getByRole("dialog", { name: "Catat pengeluaran" });
    await dialog.getByLabel("Jumlah").fill("20.000");
    await dialog.getByRole("button", { name: "Simpan pengeluaran" }).click();
    await expectResult(page, /./, "error");
    await expect(dialog.getByText("Wajib diisi.")).toBeVisible();
    await choose(dialog, "Karyawan penerima", accounts.cashier.name);
    await dialog.getByRole("button", { name: "Simpan pengeluaran" }).click();
    await expect(page).toHaveURL(/\/id\/expenses$/);

    await page.goto("/id/expenses?new=1");
    await choose(page.getByRole("dialog"), "Jenis", "Donasi");
    await page.getByRole("dialog").getByLabel("Jumlah").fill("5.000");
    await page.getByRole("dialog").getByLabel("Keterangan").fill(`Masjid ${run}`);
    await page.getByRole("dialog").getByRole("button", { name: "Simpan pengeluaran" }).click();
    await expect(page).toHaveURL(/\/id\/expenses$/);

    const table = page.getByRole("table", { name: "Pengeluaran pada tanggal ini" });
    await expect(table.getByRole("row", { name: new RegExp(`Masjid ${run}`) })).toContainText(
      /Donasi.*Rp\s5\.000/,
    );
    await expect(table.getByRole("row", { name: /Uang makan/ }).first()).toContainText(
      accounts.cashier.name,
    );

    await page.goto("/id/pos?close=1");
    const paidAfter = await page
      .getByText("Pengeluaran dari kas", { exact: true })
      .locator("..")
      .innerText();
    const amount = (text: string) =>
      Number((/Rp\s*([\d.]+)/.exec(text)?.[1] ?? "0").replaceAll(".", ""));
    expect(amount(paidAfter) - amount(paidBefore)).toBe(25_000);
    await page.context().close();
  });

  test("the recap shows expenses and the balance", async ({ page }) => {
    await page.goto("/id/reports");
    await expect(page.getByRole("term").filter({ hasText: /^Sisa$/ })).toBeVisible();
    await expect(page.getByRole("table", { name: "Pengeluaran per jenis" })).toContainText(
      "Uang makan",
    );
  });
});
