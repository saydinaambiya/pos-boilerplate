import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { productVariants } from "@/db/schema";
import { db } from "@/db/client";
import { createBrand, createProduct, updateProduct } from "@/features/catalog/service";
import { checkout } from "@/features/checkout/service";
import { updateSettings } from "@/features/settings/service";
import { openShift } from "@/features/shifts/service";
import { calculateSale } from "@/lib/money/calculate";
import { settingDefinitions } from "@/lib/settings/schemas";
import { readSetting } from "@/lib/settings/store";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { renderInvoicePdf } from "./pdf";
import {
  createInvoiceLink,
  getInvoiceDocument,
  getInvoiceDocumentByToken,
  invoiceLabels,
} from "./service";
import { invoiceSizes } from "./types";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

/** Completes a sale of `qty` × a product named `name` and returns its id. */
async function completedSale(
  options: {
    name?: string;
    qty?: number;
    price?: number;
    details?: { brandId: string; motif: string; thickness: number };
  } = {},
) {
  const session = await owner();
  const product = await createProduct(
    session,
    {
      name: options.name ?? "Kopi Susu",
      price: options.price ?? 18_000,
      unit: "cup",
      trackStock: false,
      sku: "KOPI",
      minStock: 0,
      ...options.details,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  await openShift(session, { openingCash: 0 }, testContext());
  const qty = options.qty ?? 2;
  const total = calculateSale(
    [{ unitPrice: options.price ?? 18_000, qty }],
    await readSetting("tax"),
  ).grandTotal;
  const sale = await checkout(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      customer: { name: "Pembeli", phone: null },
      lines: [{ variantId: variant?.id ?? "", qty }],
      payments: [{ method: "CASH", amount: total }],
    },
    testContext(),
  );
  if (!sale.ok) throw new Error(sale.reason);
  return { session, saleId: sale.saleId, productId: product.id };
}

beforeEach(resetDatabase);

describe("invoice document (FR-INV-04/05)", () => {
  it("combines the frozen sale with the store profile in the chosen language", async () => {
    const session = await owner();
    await updateSettings(
      session,
      "store.profile",
      {
        ...settingDefinitions["store.profile"].defaults,
        address: "Jl. Contoh 1",
        npwp: "1234567890123456",
        invoiceFooterId: "Terima kasih",
        invoiceFooterEn: "Thank you",
      },
      testContext(),
    );
    const { saleId } = await completedSale();

    const id = await getInvoiceDocument(session, saleId, "id");
    const en = await getInvoiceDocument(session, saleId, "en");
    expect(id).toMatchObject({
      store: { address: "Jl. Contoh 1", footer: "Terima kasih", npwp: "" },
      items: [{ name: "Kopi Susu", qty: 2, total: 36_000 }],
      grandTotal: 36_000,
      payments: [{ label: "Tunai", amount: 36_000 }],
    });
    expect(en?.store.footer).toBe("Thank you");
    expect(en?.payments[0]?.label).toBe("Cash");
    if (!en) throw new Error("document expected");
    expect(invoiceLabels("en", en).ppn).toBe("VAT 0%");
  });

  it("prints brand, motif and thickness as frozen at sale time (FR-PRD-06)", async () => {
    const session = await owner();
    const brand = await createBrand(session, { name: "Turkiye" }, testContext());
    if (!brand.ok) throw new Error(brand.reason);
    const { saleId, productId } = await completedSale({
      name: "Sajadah",
      details: { brandId: brand.id, motif: "Mihrab", thickness: 8 },
    });
    await updateProduct(
      session,
      productId,
      {
        name: "Sajadah",
        motif: "Bunga",
        price: 18_000,
        unit: "cup",
        trackStock: false,
      },
      testContext(),
    );

    const document = await getInvoiceDocument(session, saleId, "id");
    expect(document?.items).toMatchObject([{ name: "Sajadah", details: "Turkiye · Mihrab · 8mm" }]);
    if (!document) throw new Error("document expected");
    const labels = invoiceLabels("id", document);
    for (const size of invoiceSizes) {
      const pdf = await renderInvoicePdf(document, labels, size);
      expect(pdf.subarray(0, 5).toString(), size).toBe("%PDF-");
    }
  }, 60_000);

  it("leaves details empty for products without them", async () => {
    const session = await owner();
    const { saleId } = await completedSale();
    expect((await getInvoiceDocument(session, saleId, "id"))?.items[0]?.details).toBeNull();
  });

  it("shows the NPWP only when PPN was charged (FR-SET-01)", async () => {
    const session = await owner();
    await updateSettings(
      session,
      "store.profile",
      { ...settingDefinitions["store.profile"].defaults, npwp: "1234567890123456" },
      testContext(),
    );
    await updateSettings(
      session,
      "tax",
      { ...settingDefinitions.tax.defaults, ppnEnabled: true, ppnRateBps: 1100 },
      testContext(),
    );
    const { saleId } = await completedSale({ qty: 1, price: 10_000 });
    expect((await getInvoiceDocument(session, saleId, "id"))?.store.npwp).toBe("1234567890123456");
  });
});

describe("signed download links (FR-PDF-04/05)", () => {
  it("resolves exactly one invoice until the link expires", async () => {
    const { session, saleId } = await completedSale();
    const now = new Date();
    const link = await createInvoiceLink(session, saleId, now);
    if (!link) throw new Error("link expected");

    expect((await getInvoiceDocumentByToken(link.token, "id", now))?.invoiceNo).toMatch(/^INV-/);
    const afterExpiry = new Date(link.expiresAt.getTime() + 1000);
    expect(await getInvoiceDocumentByToken(link.token, "id", afterExpiry)).toBeUndefined();
    expect(await getInvoiceDocumentByToken(`${link.token}x`, "id", now)).toBeUndefined();
  });

  it("is only minted for viewers allowed to see the sale", async () => {
    const { saleId } = await completedSale();
    const cashier = await signIn("kasir", "123456");
    expect(await createInvoiceLink(cashier, saleId)).toBeUndefined();
  });
});

describe("PDF rendering (FR-PDF-01, FR-INV-03)", () => {
  it("renders every paper size, including extreme names and amounts", async () => {
    const session = await owner();
    const { saleId } = await completedSale({
      name: "Nama sangat panjang ".repeat(6).slice(0, 120),
      qty: 50,
      price: 999_999_999,
    });
    const document = await getInvoiceDocument(session, saleId, "id");
    if (!document) throw new Error("document expected");
    const labels = invoiceLabels("id", document);

    for (const size of invoiceSizes) {
      const pdf = await renderInvoicePdf(document, labels, size);
      expect(pdf.subarray(0, 5).toString(), size).toBe("%PDF-");
      expect(pdf.byteLength, size).toBeGreaterThan(1000);
    }
  }, 60_000);
});
