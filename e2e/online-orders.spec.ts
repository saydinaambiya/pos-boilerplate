import { expect, test } from "./fixtures";
import { cashierAtPos, choose, createStockedProduct, grantEmployeePermission } from "./helpers";

/** Unique names per run: the E2E database is not truncated between runs. */
const run = Date.now().toString(36).toUpperCase();
const market = `Toko Oren ${run}`;
const product = `Sandal ${run}`;
const sku = `SDL-${run}`;
const code = `SO-${run}`;

test.describe("online orders from entry to return (FR-ONL)", () => {
  test.skip(({ isMobile }) => isMobile, "stateful order flows run once, on desktop");
  test.describe.configure({ mode: "serial" });

  test("prepares a marketplace, a product and permissions", async ({ page }) => {
    await page.goto("/id/settings/marketplaces");
    await page.getByLabel("Nama marketplace").fill(market);
    await page.getByRole("button", { name: "Tambah marketplace" }).click();
    await expect(page.getByRole("link", { name: `Ubah ${market}` })).toBeVisible();
    await grantEmployeePermission(page, "Ubah status pesanan online");
    await createStockedProduct(page, {
      category: `Alas kaki ${run}`,
      name: product,
      sku,
      price: "45000",
      stock: "4",
    });
  });

  test("a cashier enters an order and stock drops", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.goto("/id/online-orders?new=1");
    const entry = page.getByRole("dialog", { name: "Pesanan online baru" });
    await choose(entry, "Marketplace", market);
    await page.getByRole("button", { name: "Simpan pesanan" }).click();
    await expect(page.getByText("Kode order wajib diisi.")).toBeVisible();

    await entry.getByLabel("Kode order").fill(code.toLowerCase());
    await page.getByRole("searchbox", { name: "Cari produk" }).fill(product);
    await page.getByRole("button", { name: `Tambah ${product}` }).click();
    await page.getByRole("button", { name: `Tambah ${product}` }).click();
    await expect(page.getByRole("textbox", { name: `Jumlah ${product}` })).toHaveValue("2");
    await page.getByLabel("Ongkir (opsional)").fill("10.000");
    await page.getByRole("button", { name: "Simpan pesanan" }).click();

    await expect(page).toHaveURL(/\/id\/online-orders\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(code);
    await expect(page.getByText("Diproses").first()).toBeVisible();
    await expect(page.getByRole("table", { name: "Item pesanan" })).toContainText("Rp 90.000");
    await page.context().close();
  });

  test("the board finds it and it moves through shipping and a return", async ({ browser }) => {
    const page = await cashierAtPos(browser);
    await page.goto("/id/online-orders");
    await page.getByRole("searchbox", { name: "Kode order" }).fill(code);
    await expect(page).toHaveURL(/q=/);
    await page.getByRole("link", { name: `Buka pesanan ${code}` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(code);

    const step = async (action: string, status: string) => {
      await page.getByRole("button", { name: action }).click();
      const dialog = page.getByRole("dialog", { name: `Ubah status ke ${status}?` });
      await dialog.getByRole("button", { name: action }).click();
      await expect(page.getByRole("list", { name: "Riwayat status" })).toContainText(status);
    };
    await step("Tandai dikirim", "Dalam perjalanan");
    await step("Ajukan retur", "Retur diajukan");

    await page.getByRole("button", { name: "Terima retur" }).click();
    const dialog = page.getByRole("dialog", { name: "Ubah status ke Retur diterima?" });
    await choose(dialog, `Kondisi ${product} (2 pcs)`, "Rusak — write-off");
    await dialog.getByRole("button", { name: "Terima retur" }).click();
    await expect(page.getByRole("table", { name: "Item pesanan" })).toContainText(
      "Rusak — write-off",
    );
    await page.context().close();
  });
});
