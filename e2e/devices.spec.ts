import type { Browser, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { expectResult } from "./helpers";

/** Names are unique per run because the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const username = `perangkat-${run}`;
const pin = "975310";

async function signInFresh(browser: Browser, secret: string): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/id/login");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.getByLabel(/^(Password|PIN)$/).fill(secret);
  await page.getByRole("button", { name: "Masuk" }).click();
  return page;
}

test.describe("signed-in devices (FR-AUTH-09/10)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful device flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("the account card opens the device list over the current page (ADR-0030)", async ({
    page,
  }) => {
    await page.goto("/id/products");
    const sidebar = page.getByRole("complementary").filter({ visible: true }).first();
    await expect(sidebar.getByText("Owner E2E", { exact: true })).toBeVisible();
    await sidebar.getByRole("link", { name: "Perangkat login" }).click();
    const dialog = page.getByRole("dialog", { name: "Perangkat login" });
    await expect(dialog.getByText("Perangkat ini")).toBeVisible();
    /** The page stays underneath; the modal hides it from assistive tech, so query the element. */
    await expect(page.locator("h1")).toHaveText("Produk");
    await expect(page.getByTestId("loading-indicator")).toHaveAttribute("data-busy", "false");

    await dialog.getByRole("button", { name: "Tutup" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/id\/products$/);
    await expect(page.getByTestId("loading-indicator")).toHaveAttribute("data-busy", "false");
    await expect(page.getByTestId("loading-indicator")).toBeHidden();

    await page.goto("/id/devices");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Perangkat login");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("an employee signs another device out", async ({ page, browser }) => {
    await page.goto("/id/employees?new=1");
    await page.getByLabel("Nama").fill(`Perangkat ${run}`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("PIN awal").fill("135791");
    await page.getByRole("button", { name: "Buat karyawan" }).click();
    await expect(page).toHaveURL(/\/id\/employees$/);

    const first = await signInFresh(browser, "135791");
    await first.getByLabel("PIN baru", { exact: true }).fill(pin);
    await first.getByLabel("Ulangi PIN baru").fill(pin);
    await first.getByRole("button", { name: "Simpan PIN" }).click();
    await expect(first).toHaveURL(/\/id$/);
    const second = await signInFresh(browser, pin);
    await expect(second).toHaveURL(/\/id$/);

    await first.goto("/id/devices");
    await expect(first.getByText("2 dari maksimal 10 perangkat")).toBeVisible();
    await first.getByRole("button", { name: "Keluarkan" }).click();
    await first.getByRole("dialog").getByRole("button", { name: "Keluarkan" }).click();
    await expectResult(first, "Perangkat sudah dikeluarkan.");
    await expect(first.getByText("1 dari maksimal 10 perangkat")).toBeVisible();

    await second.goto("/id/devices");
    await expect(second).toHaveURL(/\/id\/login$/);
    await second.context().close();

    await page.goto("/id/employees");
    await page.getByRole("link", { name: `Ubah Perangkat ${run}` }).click();
    const devices = page.getByRole("list", { name: "Daftar perangkat" });
    await expect(devices.getByRole("listitem")).toHaveCount(1);
    await devices.getByRole("button", { name: "Keluarkan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Keluarkan" }).click();
    await expectResult(page, "Perangkat sudah dikeluarkan.");
    await expect(devices.getByRole("listitem")).toHaveCount(0);

    await first.goto("/id");
    await expect(first).toHaveURL(/\/id\/login$/);
    await first.context().close();
  });
});
