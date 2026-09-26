import type { Browser, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { expectResult } from "./helpers";

/** Names are unique per run because the E2E database is not truncated between runs. */
const run = Date.now().toString(36);

async function signInFresh(browser: Browser, username: string, pin: string): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/id/login");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByLabel(/^(Password|PIN)$/).fill(pin);
  await page.getByRole("button", { name: "Masuk" }).click();
  return page;
}

test.describe("employees & roles (FR-EMP, FR-RBAC-01)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful management flows run once, on desktop");

  test("validates the employee form inline and keeps typed values", async ({ page }) => {
    await page.goto("/id/employees/new");
    await page.getByRole("button", { name: "Buat karyawan" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Wajib diisi.").first()).toBeVisible();
    await expect(page.getByLabel("Nama")).toBeFocused();

    await page.getByLabel("Nama").fill("Duplikat");
    await page.getByLabel("Username").fill("kasir");
    await page.getByLabel("PIN awal").fill("135790");
    await page.getByRole("button", { name: "Buat karyawan" }).click();
    await expect(page.getByText("Username sudah dipakai.")).toBeVisible();
    await expect(page.getByLabel("Nama")).toHaveValue("Duplikat");
  });

  test("creates a role and an employee who only gets that role's pages", async ({
    page,
    browser,
  }) => {
    const roleName = `Gudang ${run}`;
    const username = `gudang-${run}`;

    await page.goto("/id/employees/roles/new");
    await page.getByLabel("Nama role").fill(roleName);
    await page.getByLabel("Halaman dasbor").check();
    await page.getByLabel("Halaman stok").check();
    await page.getByRole("button", { name: "Buat role" }).click();
    await expect(page).toHaveURL(/\/id\/employees\/roles$/);
    await expect(page.getByRole("link", { name: `Ubah ${roleName}` })).toBeVisible();

    await page.goto("/id/employees/new");
    await page.getByLabel("Nama").fill(`Staf Gudang ${run}`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Role").selectOption({ label: roleName });
    await page.getByLabel("PIN awal").fill("135790");
    await page.getByRole("button", { name: "Buat karyawan" }).click();
    await expect(page).toHaveURL(/\/id\/employees$/);
    const row = page.getByRole("row", { name: new RegExp(username) });
    await expect(row.getByText("Belum ganti PIN")).toBeVisible();

    const employee = await signInFresh(browser, username, "135790");
    await expect(employee).toHaveURL(/\/id\/change-pin$/);
    await employee.getByLabel("PIN baru", { exact: true }).fill("864209");
    await employee.getByLabel("Ulangi PIN baru").fill("864209");
    await employee.getByRole("button", { name: "Simpan PIN" }).click();
    await expect(employee).toHaveURL(/\/id$/);

    const nav = employee
      .getByRole("navigation", { name: "Navigasi utama" })
      .filter({ visible: true });
    await expect(nav.getByRole("link", { name: "Stok" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Kasir" })).toHaveCount(0);
    expect((await employee.goto("/id/employees"))?.status()).toBe(403);
    await employee.context().close();
  });

  test("resets a PIN and deactivates an employee behind a confirmation", async ({
    page,
    browser,
  }) => {
    const username = `sementara-${run}`;
    await page.goto("/id/employees/new");
    await page.getByLabel("Nama").fill(`Sementara ${run}`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("PIN awal").fill("246802");
    await page.getByRole("button", { name: "Buat karyawan" }).click();
    await page.getByRole("link", { name: `Ubah Sementara ${run}` }).click();

    await page.getByLabel("PIN sementara").fill("111222");
    await page.getByRole("button", { name: "Reset PIN" }).click();
    await expectResult(page, "PIN direset. Sampaikan PIN sementara kepada karyawan.");

    await page.getByRole("button", { name: "Nonaktifkan" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`Nonaktifkan Sementara ${run}?`);
    await dialog.getByRole("button", { name: "Nonaktifkan" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Akun ini nonaktif dan tidak dapat login.")).toBeVisible();

    const blocked = await signInFresh(browser, username, "111222");
    await expect(blocked.locator("form").getByRole("alert")).toHaveText("Username atau PIN salah.");
    await blocked.context().close();
  });

  test("keeps the Owner role read-only", async ({ page }) => {
    await page.goto("/id/employees/roles");
    await page.getByRole("link", { name: "Ubah Owner" }).click();
    await expect(page.getByText("Role Owner memiliki semua permission")).toBeVisible();
    await expect(page.getByLabel("Kelola role & permission")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Simpan perubahan" })).toHaveCount(0);
  });
});
