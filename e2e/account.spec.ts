import AxeBuilder from "@axe-core/playwright";

import { accounts } from "./accounts";
import { expect, test } from "./fixtures";
import { expectResult } from "./helpers";

/**
 * A successful password change or recovery signs the shared Owner session
 * out everywhere, so those paths are covered by the service tests; here the
 * pages, code creation and refusals are exercised.
 */
test.describe("owner account and recovery (FR-AUTH-11/12, ADR-0037)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful account flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("the security tab sits under settings, not on the account card", async ({ page }) => {
    await page.goto("/id/settings");
    const sidebar = page.getByRole("complementary").filter({ visible: true }).first();
    await expect(sidebar.getByRole("link", { name: "Akun & keamanan" })).toHaveCount(0);
    await page.getByRole("link", { name: "Akun & keamanan" }).click();
    await expect(page).toHaveURL(/\/id\/settings\/account$/);
    await expect(page.getByRole("heading", { name: "Ganti password" })).toBeVisible();

    await page.getByLabel("Password sekarang", { exact: true }).first().fill("wrong-password!");
    await page.getByLabel("Password baru", { exact: true }).fill("short");
    await page.getByLabel("Ulangi password baru").fill("different");
    await page.getByRole("button", { name: "Simpan password" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Password tidak sama.")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("creates recovery codes shown once and clears the banner", async ({ page }) => {
    await page.goto("/id/settings/account");
    await page
      .getByLabel("Password sekarang", { exact: true })
      .last()
      .fill(accounts.owner.password);
    await page.getByRole("button", { name: /Buat kode (pemulihan|baru)/ }).click();

    const list = page.getByRole("list", { name: "Kode pemulihan baru" });
    await expect(list.getByRole("listitem")).toHaveCount(8);
    await expect(list.getByRole("listitem").first()).toHaveText(
      /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/,
    );
    await expect(
      page.getByText("Kode hanya ditampilkan sekali ini.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sudah saya simpan" }).click();
    await expect(list).toBeHidden();
    await expect(page.getByText("8 dari 8 kode belum dipakai.", { exact: false })).toBeVisible();
    await expect(page.getByText("Anda belum punya kode pemulihan.", { exact: false })).toHaveCount(
      0,
    );
  });

  test("the password step links to recovery, which refuses a wrong code", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/id/login");
    await page.getByLabel("Username").fill(accounts.owner.username);
    await page.getByRole("button", { name: "Lanjut" }).click();
    await page.getByRole("link", { name: "Lupa password?" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lupa password");
    await expect(page.getByLabel("Username")).toHaveValue(accounts.owner.username);
    await page.getByLabel("Kode pemulihan").fill("AAAA-AAAA-AAAA-AAAA");
    await page.getByLabel("Password baru", { exact: true }).fill("a-brand-new-passphrase");
    await page.getByLabel("Ulangi password baru").fill("a-brand-new-passphrase");
    await page.getByRole("button", { name: "Simpan password baru" }).click();
    await expectResult(page, "Username atau kode pemulihan salah.", "error");

    await page.goto("/id/login");
    await page.getByLabel("Username").fill("kasir-e2e-unknown");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page.getByRole("link", { name: "Lupa password?" })).toHaveCount(0);
    await context.close();
  });
});
