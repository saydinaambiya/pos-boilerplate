import { expect, test } from "./fixtures";
import {
  cashierAtPos,
  choose,
  createStockedProduct,
  expectResult,
  grantEmployeePermission,
} from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36).toUpperCase();
const code = `E2E${run}`.slice(0, 20);
const product = `Kue ${run}`;
const sku = `KUE-${run}`;

test.describe("vouchers with approval and POS use (FR-VCH, FR-POS-03)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful voucher flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares permissions and a product", async ({ page }) => {
    await grantEmployeePermission(page, "Halaman voucher");
    await grantEmployeePermission(page, "Ajukan voucher");
    await createStockedProduct(page, {
      name: product,
      sku,
      price: "50000",
      stock: "5",
    });
  });

  test("a cashier proposes a voucher that waits for approval", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.goto("/id/vouchers?new=1");
    await page.getByLabel("Kode").fill(code.toLowerCase());
    await page.getByLabel("Nama").fill("Diskon E2E");
    await page.getByLabel("Nilai").fill("120");
    await page.getByRole("button", { name: "Ajukan voucher" }).click();
    await expectResult(page, /./, "error");
    await expect(page.getByText("Maksimal 100.")).toBeVisible();

    await page.getByLabel("Nilai").fill("10");
    await page.getByLabel("Maksimum potongan").fill("3.000");
    await page.getByRole("button", { name: "Ajukan voucher" }).click();
    await expect(page).toHaveURL(/\/id\/vouchers\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(code);
    await expect(page.getByText("Menunggu persetujuan").first()).toBeVisible();
    await page.context().close();
  });

  test("the owner approves it from the inbox", async ({ page }) => {
    await page.goto("/id/approvals");
    const card = page.getByRole("listitem").filter({ hasText: code });
    await choose(page, "Jenis pengajuan", "Void transaksi");
    await expect(page).toHaveURL(/type=VOID/);
    await expect(card).toHaveCount(0);
    await choose(page, "Jenis pengajuan", "Voucher");
    await expect(page).toHaveURL(/type=VOUCHER/);
    await expect(card).toContainText("Voucher baru");
    await expect(card).toContainText("10%");
    await card.getByRole("button", { name: "Setujui" }).click();
    await page
      .getByRole("dialog", { name: "Setujui pengajuan ini?" })
      .getByRole("button", { name: "Setujui" })
      .click();
    await expectResult(page, "Pengajuan disetujui.");
    await expect(page.getByRole("listitem").filter({ hasText: code })).toHaveCount(0);

    await page.getByRole("link", { name: "Riwayat" }).click();
    const decided = page.getByRole("listitem").filter({ hasText: code });
    await expect(decided).toContainText("Disetujui");
    await expect(decided.getByRole("button", { name: "Setujui" })).toHaveCount(0);
  });

  test("the cashier applies it at the POS", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    const cart = page.getByRole("complementary", { name: "Keranjang" });
    await page.getByRole("searchbox", { name: "Cari produk" }).fill(product);
    await page.getByRole("button", { name: new RegExp(product) }).click();

    await cart.getByLabel("Kode voucher").fill("SALAH");
    await cart.getByRole("button", { name: "Pakai" }).click();
    await expect(cart.getByRole("alert")).toHaveText("Voucher tidak ditemukan atau tidak aktif.");

    await cart.getByLabel("Kode voucher").fill(code);
    await cart.getByRole("button", { name: "Pakai" }).click();
    await expect(cart).toContainText(new RegExp(`Voucher ${code} \\(10%\\)\\s*−Rp\\s3\\.000`));
    await expect(cart).toContainText("Potongan maksimal Rp 3.000");

    await page.keyboard.press("F2");
    const payment = page.getByRole("dialog", { name: "Pembayaran" });
    await payment.getByLabel("Nama pelanggan").fill("Pembeli E2E");
    await payment.getByRole("button", { name: "Uang pas" }).click();
    await payment.getByRole("button", { name: "Selesaikan transaksi" }).click();
    const success = page.getByRole("dialog", { name: "Transaksi berhasil" });
    const invoiceNo = (/INV-\d{8}-\d{4}/.exec(await success.innerText()) ?? [""])[0];
    expect(invoiceNo).not.toBe("");

    await page.goto("/id/vouchers");
    await page.getByRole("link", { name: `Buka voucher ${code}` }).click();
    await expect(
      page.getByRole("table", { name: "Transaksi yang memakai voucher ini" }),
    ).toContainText(invoiceNo);
    await expect(page.getByText("1 / tanpa batas")).toBeVisible();
    await page.context().close();
  });
});
