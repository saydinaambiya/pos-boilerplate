import { expect, test } from "./fixtures";
import { cashierAtPos, createStockedProduct, grantEmployeePermission } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36).toUpperCase();
const customer = `Pelanggan ${run}`;
const phone = `0812${String(Date.now()).slice(-8)}`;
const product = `Tas ${run}`;
const sku = `TAS-${run}`;

const rupiah = (text: string) => Number(text.replace(/\D/g, ""));

test.describe("store credit with approved installments (FR-PAY-05, FR-KSB)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful store credit flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  let invoiceNo = "";
  let credit = 0;

  test("prepares permissions and a product", async ({ page }) => {
    await grantEmployeePermission(page, "Halaman kas bon");
    await grantEmployeePermission(page, "Jadikan sisa tagihan kas bon");
    await grantEmployeePermission(page, "Catat cicilan kas bon");
    await createStockedProduct(page, {
      category: `Aksesori ${run}`,
      name: product,
      sku,
      price: "80000",
      stock: "5",
    });
  });

  test("a cashier puts the remainder of a sale on store credit", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.getByRole("searchbox", { name: "Cari produk" }).fill(product);
    await page.getByRole("button", { name: new RegExp(product) }).click();
    await page.keyboard.press("F2");

    const payment = page.getByRole("dialog", { name: "Pembayaran" });
    await payment.getByText("Kas bon", { exact: true }).click();
    await payment.getByLabel("Uang muka tunai (opsional)").fill("20.000");
    await payment.getByLabel("No. HP").fill("12345");
    await payment.getByRole("button", { name: "Selesaikan transaksi" }).click();
    await expect(
      payment.getByText("Nomor HP Indonesia tidak valid", { exact: false }),
    ).toBeVisible();
    await expect(payment.getByText("Nama pelanggan wajib diisi.")).toBeVisible();

    await payment.getByLabel("No. HP").fill(phone);
    await payment.getByLabel("Nama pelanggan").fill(customer);
    await payment.getByRole("button", { name: "Selesaikan transaksi" }).click();

    const success = page.getByRole("dialog", { name: "Transaksi berhasil" });
    const text = await success.innerText();
    invoiceNo = (/INV-\d{8}-\d{4}/.exec(text) ?? [""])[0];
    credit = rupiah(/Kas bon: (Rp[\s\d.]+)/.exec(text)?.[1] ?? "");
    expect(invoiceNo).not.toBe("");
    expect(credit).toBeGreaterThan(0);
    await page.context().close();
  });

  test("the cashier records an installment that waits for approval", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.goto("/id/kasbon");
    await page.getByRole("searchbox", { name: "Cari" }).fill(customer);
    await expect(page).toHaveURL(/q=/);
    await page.getByRole("link", { name: `Buka kas bon ${customer} (${invoiceNo})` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(customer);

    const methods = page.getByRole("group", { name: "Metode" });
    for (const method of ["Tunai", "Transfer", "Tunai + transfer"]) {
      await expect(methods.getByRole("radio", { name: method, exact: true })).toBeVisible();
    }
    const amount = page.getByLabel("Nominal", { exact: true });
    await amount.fill(String(credit + 1));
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: "Catat pembayaran" })).toBeDisabled();

    await amount.fill("10000");
    await expect(amount).toHaveValue("10.000");
    await page.getByLabel("Uang diterima (opsional)").fill("20000");
    await expect(page.getByText("Kembalian: Rp 10.000")).toBeVisible();
    await page.getByRole("button", { name: "Catat pembayaran" }).click();
    const result = page.getByRole("dialog", { name: "Berhasil" });
    await expect(result).toContainText("Pembayaran dicatat dan menunggu persetujuan.");
    await result.getByRole("button", { name: "Oke" }).click();
    await expect(result).toBeHidden();
    await expect(
      page.getByRole("table", { name: "Pembayaran kas bon, terbaru di atas" }),
    ).toContainText("Menunggu");
    await page.context().close();
  });

  test("the owner approves it and the balance drops", async ({ page }) => {
    await page.goto("/id/approvals");
    const card = page.getByRole("listitem").filter({ hasText: customer });
    await expect(card).toContainText("Pembayaran kas bon");
    await card.getByRole("button", { name: "Setujui" }).click();
    await page
      .getByRole("dialog", { name: "Setujui pengajuan ini?" })
      .getByRole("button", { name: "Setujui" })
      .click();
    await expect(page.getByRole("listitem").filter({ hasText: customer })).toHaveCount(0);

    await page.goto(`/id/kasbon?filter=all&q=${encodeURIComponent(customer)}`);
    await page.getByRole("link", { name: `Buka kas bon ${customer} (${invoiceNo})` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(customer);
    await expect(page.getByText("Dicicil")).toBeVisible();
    const balance = page
      .locator("dl > div")
      .filter({ has: page.locator("dt", { hasText: /^Saldo$/ }) })
      .locator("dd");
    expect(rupiah(await balance.innerText())).toBe(credit - 10_000);
  });
});
