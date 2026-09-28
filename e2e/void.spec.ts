import { expect, test } from "./fixtures";
import {
  cashierAtPos,
  createStockedProduct,
  expectResult,
  grantEmployeePermission,
} from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36);
const product = `Roti ${run}`;
const sku = `ROTI-${run}`.toUpperCase();

test.describe("void through approvals (FR-POS-09, FR-APR)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful approval flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  let saleUrl = "";
  let invoiceNo = "";

  test("prepares a product and lets cashiers request voids", async ({ page }) => {
    await grantEmployeePermission(page, "Ajukan void transaksi");
    await createStockedProduct(page, {
      name: product,
      sku,
      price: "7000",
      stock: "5",
    });
  });

  test("a cashier sells and requests a void with a reason", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.getByRole("searchbox", { name: "Cari produk" }).fill(product);
    await page.getByRole("button", { name: new RegExp(product) }).click();
    await page.keyboard.press("F2");
    const payment = page.getByRole("dialog", { name: "Pembayaran" });
    await payment.getByLabel("Nama pelanggan").fill("Pembeli E2E");
    await payment.getByRole("button", { name: "Uang pas" }).click();
    await payment.getByRole("button", { name: "Selesaikan transaksi" }).click();
    const success = page.getByRole("dialog", { name: "Transaksi berhasil" });
    invoiceNo = (/INV-\d{8}-\d{4}/.exec(await success.innerText()) ?? [""])[0];
    await success.getByRole("link", { name: "Lihat struk" }).click();
    await expect(page).toHaveURL(/\/id\/pos\/sales\?view=[0-9a-f-]+$/);
    const url = new URL(page.url());
    saleUrl = `${url.pathname}${url.search}`;

    await page.getByRole("button", { name: "Void transaksi" }).click();
    const dialog = page.getByRole("dialog", { name: `Ajukan void ${invoiceNo}?` });
    await dialog.getByRole("button", { name: "Ajukan void" }).click();
    await expectResult(page, /./, "error");
    await expect(dialog.getByText("Wajib diisi.")).toBeVisible();
    await dialog.getByLabel("Alasan void").fill("Pelanggan batal membeli");
    await dialog.getByRole("button", { name: "Ajukan void" }).click();
    await expect(page.getByText("Void menunggu persetujuan.")).toBeVisible();
    await page.context().close();
  });

  test("the owner sees the pending request and approves it", async ({ page }) => {
    await page.goto("/id");
    await expect(page.getByText("Menunggu persetujuan")).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Navigasi utama" })
        .filter({ visible: true })
        .getByRole("link", { name: /Persetujuan/ }),
    ).toContainText(/\d/);

    await page.goto("/id/approvals");
    const card = page.getByRole("listitem").filter({ hasText: invoiceNo });
    await expect(card).toContainText("Alasan: Pelanggan batal membeli");
    await card.getByRole("button", { name: "Setujui" }).click();
    const dialog = page.getByRole("dialog", { name: "Setujui pengajuan ini?" });
    await dialog.getByLabel("Catatan (opsional)").fill("Disetujui");
    await dialog.getByRole("button", { name: "Setujui" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("listitem").filter({ hasText: invoiceNo })).toHaveCount(0);

    await page.goto(saleUrl);
    await expect(page.getByText("Transaksi ini sudah dibatalkan (void).")).toBeVisible();
    await page.goto(`/id/stock?q=${sku}`);
    await expect(page.getByRole("row", { name: new RegExp(product) })).toContainText("5");
  });
});
