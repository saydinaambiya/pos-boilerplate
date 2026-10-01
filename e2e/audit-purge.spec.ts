import { OLD_AUDIT_DAY } from "./accounts";
import { expect, test } from "./fixtures";
import { expectResult } from "./helpers";

test.describe("audit log purge (FR-AUD-05)", () => {
  test.skip(({ isMobile }) => isMobile, "the purge deletes shared seed data, so it runs once");

  test("refuses today and deletes a past day only after its CSV download", async ({ page }) => {
    await page.goto("/id/audit");
    await page.getByRole("link", { name: "Hapus log lama" }).click();
    const dialog = page.getByRole("dialog", { name: "Hapus audit log lama" });
    await expect(dialog.getByText("Pilih tanggal awal dan akhir.")).toBeVisible();

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    await page.goto(`/id/audit?purge=1&purgeFrom=${today}&purgeTo=${today}`);
    await expect(dialog.getByRole("alert")).toContainText("Rentang tidak valid");

    await page.goto(`/id/audit?purge=1&purgeFrom=${OLD_AUDIT_DAY}&purgeTo=${OLD_AUDIT_DAY}`);
    await expect(dialog).toContainText("3 log dari");
    await expect(dialog.getByRole("button", { name: "Hapus 3 log" })).toBeDisabled();
    await expect(dialog.getByText("Unduh CSV dulu sebelum menghapus.")).toBeVisible();

    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Unduh CSV" }).click();
    expect((await download).suggestedFilename()).toBe(
      `audit-log-${OLD_AUDIT_DAY}-${OLD_AUDIT_DAY}.csv`,
    );
    await expectResult(page, "CSV sudah diunduh. Sekarang log bisa dihapus.");
    await expect(dialog.getByText(/^Diunduh /)).toBeVisible();

    await dialog.getByLabel(/^Saya sudah menyimpan file CSV-nya/).check();
    await dialog.getByRole("button", { name: "Hapus 3 log" }).click();
    await expectResult(page, "3 log dihapus.");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/id\/audit$/);

    await page.goto(`/id/audit?purge=1&purgeFrom=${OLD_AUDIT_DAY}&purgeTo=${OLD_AUDIT_DAY}`);
    await expect(dialog).toContainText("Tidak ada log dari");
  });
});
