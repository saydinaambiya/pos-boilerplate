import { expect, test } from "./fixtures";
import { choose, expectResult } from "./helpers";

/** The E2E database persists between runs, so created names carry a run suffix. */
const run = Date.now().toString(36);

test.describe("settings (FR-SET) and audit log (FR-AUD-03)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful settings flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("saves the store profile with inline validation", async ({ page }) => {
    await page.goto("/id/settings");
    await page.getByLabel("Alamat").fill("Jl. Contoh No. 1, Jakarta");
    await page.getByLabel("Telepon").fill("0812345");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Format tidak valid.")).toBeVisible();
    await expect(page.getByLabel("Telepon")).toBeFocused();
    await expect(page.getByLabel("Alamat")).toHaveValue("Jl. Contoh No. 1, Jakarta");

    await page.getByLabel("Telepon").fill("+62 812-3456-7890");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, "Pengaturan disimpan.");
    await expect(page.getByLabel("Telepon")).toHaveValue("+6281234567890");

    await page.goto("/id");
    await expect(page.getByText("Profil toko belum lengkap")).toHaveCount(0);
  });

  test("requires a rate when VAT is enabled", async ({ page }) => {
    await page.goto("/id/settings/tax");
    await page.getByLabel("Kenakan PPN").check();
    await page.getByLabel("Tarif PPN (%)").fill("0");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Wajib diisi.")).toBeVisible();
    await expect(page.getByLabel("Kenakan PPN")).toBeChecked();

    await page.getByLabel("Tarif PPN (%)").fill("11");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, "Pengaturan disimpan.");
  });

  test("enforces the minimum housekeeping retention (BR-18)", async ({ page }) => {
    await page.goto("/id/settings/operations");
    const retention = page.getByLabel("Retensi data sebelum housekeeping (bulan)");
    await retention.fill("2");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Minimal 3.")).toBeVisible();
    await retention.fill("12");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, "Pengaturan disimpan.");
  });

  test("adds a bank account and a marketplace", async ({ page }) => {
    await page.goto("/id/settings/bank-accounts");
    await page.getByLabel("Nama bank").fill(`Bank ${run}`);
    await page.getByLabel("Nomor rekening").fill("123 456 7890");
    await page.getByLabel("Atas nama").fill("Toko Contoh");
    await page.getByRole("button", { name: "Tambah rekening" }).click();
    await expect(page.getByRole("row", { name: new RegExp(`Bank ${run}`) })).toContainText(
      "1234567890",
    );

    await page.goto("/id/settings/marketplaces");
    await page.getByLabel("Nama marketplace").fill(`Pasar ${run}`);
    await page.getByRole("button", { name: "Tambah marketplace" }).click();
    await expect(page.getByRole("link", { name: `Ubah Pasar ${run}` })).toBeVisible();

    await page.getByLabel("Nama marketplace").fill(`pasar ${run}`);
    await page.getByRole("button", { name: "Tambah marketplace" }).click();
    await expect(page.getByText("Nama sudah dipakai.")).toBeVisible();
  });

  test("shows the changes in the audit log", async ({ page }) => {
    await page.goto("/id/audit");
    await choose(page, "Aksi", "Pengaturan diubah");
    await expect(page).toHaveURL(/action=settings\.updated/);

    const rows = page.getByRole("row").filter({ hasText: "Pengaturan diubah" });
    await expect(rows.first()).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Login berhasil" })).toHaveCount(0);
    await rows.first().getByText("Lihat detail").click();
    await expect(rows.first().getByText("Perubahan")).toBeVisible();
  });
});

test.describe("store opening hours (FR-SET-09)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful settings flows run once, on desktop");

  test("validates each day and saves without restricting the POS", async ({ page }) => {
    await page.goto("/id/settings/hours");
    await expect(page.getByLabel("Batasi kasir sesuai jam buka")).not.toBeChecked();
    await page.getByLabel("Jam buka Senin").fill("21:00");
    await page.getByLabel("Jam tutup Senin").fill("08:00");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Jam tutup harus setelah jam buka.")).toBeVisible();

    await page.getByLabel("Jam buka Senin").fill("08:00");
    await page.getByLabel("Jam tutup Senin").fill("21:00");
    await page.getByLabel("Minggu libur").check();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, "Pengaturan disimpan.");
    await expect(page.getByLabel("Minggu libur")).toBeChecked();
    await page.getByLabel("Minggu libur").uncheck();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expectResult(page, "Pengaturan disimpan.");
  });
});
