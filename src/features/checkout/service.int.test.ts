import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE } from "@/config/permissions";
import { db } from "@/db/client";
import {
  invoiceCounters,
  payments,
  productVariants,
  rolePermissions,
  roles,
  saleItems,
  sales,
  stockMovements,
} from "@/db/schema";
import { changeProductStatus, createProduct } from "@/features/catalog/service";
import { createVariant, enableVariants } from "@/features/catalog/variant-service";
import {
  changeBankAccountStatus,
  createBankAccount,
  getQrisAccount,
  setQrisAccount,
  updateSettings,
} from "@/features/settings/service";
import { closeShift, getShiftReport, openShift } from "@/features/shifts/service";
import { countStock, receiveStock } from "@/features/stock/service";
import type { Session } from "@/lib/auth/session";
import { settingDefinitions } from "@/lib/settings/schemas";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { type CheckoutInput, checkoutInput } from "./schemas";
import { checkout, getSale } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const cashier = () => signIn("kasir", "123456");
const NOW = new Date("2026-09-26T03:00:00Z");

let skuSeq = 0;

/** A stock-tracked product with `stock` units; returns its default variant id. */
async function product(stock: number, price = 10_000, options: { trackStock?: boolean } = {}) {
  skuSeq += 1;
  const session = await owner();
  const created = await createProduct(
    session,
    {
      name: `Produk ${String(skuSeq)}`,
      price,
      unit: "pcs",
      trackStock: options.trackStock ?? true,
      sku: `SKU-${String(skuSeq)}`,
      minStock: 0,
    },
    testContext(),
  );
  if (!created.ok) throw new Error(created.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, created.id));
  if (stock > 0)
    await receiveStock(session, variant?.id ?? "", { qty: stock, note: "" }, testContext());
  return { productId: created.id, variantId: variant?.id ?? "" };
}

function sale(
  lines: CheckoutInput["lines"],
  paid: CheckoutInput["payments"],
  key = crypto.randomUUID(),
): CheckoutInput {
  return { idempotencyKey: key, lines, payments: paid, customer: { name: "Pembeli", phone: null } };
}

async function openedShift(session: Session) {
  const opened = await openShift(session, { openingCash: 100_000 }, testContext());
  if (!opened.ok) throw new Error(opened.reason);
  return opened.id;
}

async function stockOf(variantId: string) {
  const [row] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
  return row?.stockQty;
}

beforeEach(resetDatabase);

describe("checkout (FR-POS-01..08, FR-PAY-01..04)", () => {
  it("records the sale, frozen lines, payment, stock movement and a daily invoice number", async () => {
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5, 12_500);

    const result = await checkout(
      session,
      sale([{ variantId, qty: 2 }], [{ method: "CASH", amount: 25_000 }]),
      testContext(),
      NOW,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result).toMatchObject({
      invoiceNo: "INV-20260926-0001",
      grandTotal: 25_000,
      replayed: false,
    });

    const [stored] = await db.select().from(sales).where(eq(sales.id, result.saleId));
    expect(stored).toMatchObject({
      status: "COMPLETED",
      subtotal: 25_000,
      paidTotal: 25_000,
      ppnRateBps: 0,
    });
    const [item] = await db.select().from(saleItems).where(eq(saleItems.saleId, result.saleId));
    expect(item).toMatchObject({
      unitPrice: 12_500,
      qty: 2,
      lineTotal: 25_000,
    });
    expect(item?.nameSnapshot).toMatch(/^Produk/);
    expect(await db.select().from(payments).where(eq(payments.saleId, result.saleId))).toHaveLength(
      1,
    );
    expect(await stockOf(variantId)).toBe(3);
    const [movement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.referenceId, result.saleId));
    expect(movement).toMatchObject({ type: "SALE", qtyDelta: -2, stockAfter: 3 });

    const second = await checkout(
      session,
      sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 12_500 }]),
      testContext(),
      NOW,
    );
    expect(second).toMatchObject({ ok: true, invoiceNo: "INV-20260926-0002" });
  });

  it("uses the store's local day for the invoice number", async () => {
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5);
    const lateUtc = new Date("2026-09-26T18:30:00Z");
    const result = await checkout(
      session,
      sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]),
      testContext(),
      lateUtc,
    );
    expect(result).toMatchObject({ ok: true, invoiceNo: "INV-20260927-0001" });
  });

  it("replays a repeated idempotency key and rejects a different payload (FR-POS-08)", async () => {
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5);
    const request = sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]);

    const first = await checkout(session, request, testContext(), NOW);
    const again = await checkout(session, request, testContext(), NOW);
    expect(again).toMatchObject({ ok: true, replayed: true, saleId: first.ok ? first.saleId : "" });
    expect(await db.select().from(sales)).toHaveLength(1);
    expect(await stockOf(variantId)).toBe(4);

    const changed = {
      ...request,
      lines: [{ variantId, qty: 2 }],
      payments: [{ method: "CASH" as const, amount: 20_000 }],
    };
    expect(await checkout(session, changed, testContext(), NOW)).toEqual({
      ok: false,
      reason: "idempotency-conflict",
    });
  });

  it("creates one sale for concurrent submits with the same key", async () => {
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5);
    const request = sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]);

    const results = await Promise.all(
      [1, 2, 3].map(() => checkout(session, request, testContext(), NOW)),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(new Set(results.map((result) => (result.ok ? result.saleId : "")))).toHaveProperty(
      "size",
      1,
    );
    expect(await db.select().from(sales)).toHaveLength(1);
    expect(await stockOf(variantId)).toBe(4);
  });

  it("requires an open shift (FR-SHF-01)", async () => {
    const { variantId } = await product(5);
    expect(
      await checkout(
        await cashier(),
        sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]),
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "no-open-shift" });
  });

  it("rolls everything back on insufficient stock, leaving no invoice gap (FR-STK-03, FR-POS-07)", async () => {
    const session = await cashier();
    await openedShift(session);
    const plenty = await product(10);
    const scarce = await product(1);

    const failed = await checkout(
      session,
      sale(
        [
          { variantId: plenty.variantId, qty: 1 },
          { variantId: scarce.variantId, qty: 2 },
        ],
        [{ method: "CASH", amount: 30_000 }],
      ),
      testContext(),
      NOW,
    );
    expect(failed).toEqual({
      ok: false,
      reason: "insufficient-stock",
      variantId: scarce.variantId,
      available: 1,
    });
    expect(await db.select().from(sales)).toHaveLength(0);
    expect(await stockOf(plenty.variantId)).toBe(10);
    expect(await db.select().from(invoiceCounters)).toHaveLength(0);

    const next = await checkout(
      session,
      sale([{ variantId: plenty.variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]),
      testContext(),
      NOW,
    );
    expect(next).toMatchObject({ ok: true, invoiceNo: "INV-20260926-0001" });
  });

  it("recomputes totals with tax settings and requires payments to match (PRD §5)", async () => {
    const ownerSession = await owner();
    await updateSettings(
      ownerSession,
      "tax",
      {
        ...settingDefinitions.tax.defaults,
        ppnEnabled: true,
        ppnRateBps: 1100,
        serviceEnabled: true,
        serviceRateBps: 500,
      },
      testContext(),
    );
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5, 20_000);

    expect(
      await checkout(
        session,
        sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 20_000 }]),
        testContext(),
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: "payment-mismatch",
    });
    const result = await checkout(
      session,
      sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 23_310 }]),
      testContext(),
      NOW,
    );
    if (!result.ok) throw new Error(result.reason);
    const [stored] = await db.select().from(sales).where(eq(sales.id, result.saleId));
    expect(stored).toMatchObject({
      serviceAmount: 1000,
      ppnAmount: 2310,
      grandTotal: 23_310,
      ppnRateBps: 1100,
      serviceRateBps: 500,
    });
  });

  it("splits cash and transfer to an active account (FR-PAY-02/04)", async () => {
    const ownerSession = await owner();
    const bank = await createBankAccount(
      ownerSession,
      { bankName: "BCA", accountNo: "123456", accountName: "Toko" },
      testContext(),
    );
    if (!bank.ok) throw new Error(bank.reason);
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5, 50_000);

    const result = await checkout(
      session,
      sale(
        [{ variantId, qty: 1 }],
        [
          { method: "TRANSFER", amount: 30_000, bankAccountId: bank.id },
          { method: "CASH", amount: 20_000 },
        ],
      ),
      testContext(),
      NOW,
    );
    if (!result.ok) throw new Error(result.reason);
    const paid = await db.select().from(payments).where(eq(payments.saleId, result.saleId));
    expect(paid.map((payment) => [payment.method, payment.amount]).sort()).toEqual([
      ["CASH", 20_000],
      ["TRANSFER", 30_000],
    ]);

    expect(
      await checkout(
        session,
        sale(
          [{ variantId, qty: 1 }],
          [{ method: "TRANSFER", amount: 50_000, bankAccountId: crypto.randomUUID() }],
        ),
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "invalid-payment" });
  });

  it("pays QRIS into the one QRIS account with the payer's bank (FR-PAY-07)", async () => {
    const owner_ = await owner();
    const bca = await createBankAccount(
      owner_,
      { bankName: "BCA", accountNo: "111", accountName: "Toko" },
      testContext(),
    );
    const bri = await createBankAccount(
      owner_,
      { bankName: "BRI", accountNo: "222", accountName: "Toko" },
      testContext(),
    );
    if (!bca.ok || !bri.ok) throw new Error("bank account expected");
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5, 50_000);
    const qris = (sourceBank: string) =>
      checkout(
        session,
        sale([{ variantId, qty: 1 }], [{ method: "QRIS", amount: 50_000, sourceBank }]),
        testContext(),
        NOW,
      );

    expect(await qris("GoPay")).toEqual({ ok: false, reason: "invalid-payment" });
    await setQrisAccount(owner_, bca.id, testContext());
    await setQrisAccount(owner_, bri.id, testContext());
    expect(await getQrisAccount(session)).toEqual({ label: "BRI · 222 · Toko" });

    const result = await qris("GoPay");
    if (!result.ok) throw new Error(result.reason);
    const [paid] = await db.select().from(payments).where(eq(payments.saleId, result.saleId));
    expect(paid).toMatchObject({ method: "QRIS", bankAccountId: bri.id, sourceBank: "GoPay" });
    expect(
      checkoutInput.safeParse(sale([{ variantId, qty: 1 }], [{ method: "QRIS", amount: 50_000 }]))
        .success,
    ).toBe(false);

    await changeBankAccountStatus(owner_, bri.id, false, testContext());
    expect(await getQrisAccount(session)).toBeNull();
  });

  it("allows item discounts only with pos:item-discount (FR-POS-02)", async () => {
    const { variantId } = await product(5, 10_000);
    const cashierSession = await cashier();
    await openedShift(cashierSession);
    const discounted = [{ variantId, qty: 2, discount: { type: "percent" as const, bps: 1000 } }];
    expect(
      await checkout(
        cashierSession,
        sale(discounted, [{ method: "CASH", amount: 18_000 }]),
        testContext(),
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: "discount-forbidden",
    });

    const ownerSession = await owner();
    await openedShift(ownerSession);
    const result = await checkout(
      ownerSession,
      sale(discounted, [{ method: "CASH", amount: 18_000 }]),
      testContext(),
      NOW,
    );
    expect(result).toMatchObject({ ok: true, grandTotal: 18_000 });
  });

  it("sells colour variants and rejects inactive products", async () => {
    const ownerSession = await owner();
    const { productId, variantId: hidden } = await product(0, 60_000);
    const red = await enableVariants(
      ownerSession,
      productId,
      { colorName: "Merah", hex: "", sku: "V-M", minStock: 0 },
      testContext(),
    );
    if (!red.ok) throw new Error(red.reason);
    const blue = await createVariant(
      ownerSession,
      productId,
      {
        colorName: "Biru",
        hex: "",
        sku: "V-B",
        minStock: 0,
        priceOverride: 65_000,
        initialStock: 2,
      },
      testContext(),
    );
    if (!blue.ok) throw new Error(blue.reason);
    const session = await cashier();
    await openedShift(session);

    const result = await checkout(
      session,
      sale([{ variantId: blue.id, qty: 1 }], [{ method: "CASH", amount: 65_000 }]),
      testContext(),
      NOW,
    );
    if (!result.ok) throw new Error(result.reason);
    const [item] = await db.select().from(saleItems).where(eq(saleItems.saleId, result.saleId));
    expect(item).toMatchObject({ variantSnapshot: "Biru", unitPrice: 65_000 });

    expect(
      await checkout(
        session,
        sale([{ variantId: hidden, qty: 1 }], [{ method: "CASH", amount: 60_000 }]),
        testContext(),
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: "invalid-items",
    });
    await changeProductStatus(ownerSession, productId, false, testContext());
    expect(
      await checkout(
        session,
        sale([{ variantId: blue.id, qty: 1 }], [{ method: "CASH", amount: 65_000 }]),
        testContext(),
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: "invalid-items",
    });
  });

  it("sells untracked products without stock movements", async () => {
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(0, 15_000, { trackStock: false });
    const result = await checkout(
      session,
      sale([{ variantId, qty: 3 }], [{ method: "CASH", amount: 45_000 }]),
      testContext(),
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });

  it("feeds cash into the shift's expected cash and limits receipt access", async () => {
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5);
    const result = await checkout(
      session,
      sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]),
      testContext(),
      NOW,
    );
    if (!result.ok) throw new Error(result.reason);

    expect(await getSale(session, result.saleId)).toMatchObject({ invoiceNo: result.invoiceNo });
    expect(await getSale(await signIn("kasir-baru", "111111"), result.saleId)).toBeUndefined();
    expect(await getSale(await owner(), result.saleId)).toBeDefined();

    const closed = await closeShift(session, { countedCash: 110_000, note: "" }, testContext());
    if (!closed.ok) throw new Error(closed.reason);
    expect(await getShiftReport(session, closed.id)).toMatchObject({
      expectedCash: 110_000,
      variance: 0,
    });
  });
});

describe("buyer on the sale (FR-POS-11)", () => {
  it("stores the buyer's name and optional phone with the sale", async () => {
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5);
    const result = await checkout(
      session,
      {
        ...sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]),
        customer: { name: "Pak Budi", phone: "+6281298765432" },
      },
      testContext(),
      NOW,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(await getSale(session, result.saleId)).toMatchObject({
      customerName: "Pak Budi",
      customerPhone: "+6281298765432",
    });
  });
});

describe("store hours (FR-SET-09, BR-24)", () => {
  /** NOW is Saturday 10:00 in Asia/Jakarta. */
  async function closeOnSaturday() {
    const day = { closed: false, open: "08:00", close: "21:00" };
    await updateSettings(
      await owner(),
      "store.hours",
      { enabled: true, days: [day, day, day, day, day, { ...day, closed: true }, day] },
      testContext(),
    );
  }

  it("blocks employees from opening a shift and selling while closed", async () => {
    const session = await cashier();
    await openedShift(session);
    const { variantId } = await product(5);
    await closeOnSaturday();

    expect(await openShift(session, { openingCash: 0 }, testContext(), NOW)).toEqual({
      ok: false,
      reason: "store-closed",
    });
    expect(
      await checkout(
        session,
        sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]),
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "store-closed" });
    expect((await closeShift(session, { countedCash: 100_000, note: "" }, testContext())).ok).toBe(
      true,
    );
  });

  it("lets roles with pos:after-hours sell outside store hours, like Sales", async () => {
    const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
    await db
      .insert(rolePermissions)
      .values({ roleId: role?.id ?? "", permission: "pos:after-hours" });
    const session = await cashier();
    await closeOnSaturday();
    expect((await openShift(session, { openingCash: 0 }, testContext(), NOW)).ok).toBe(true);
    const { variantId } = await product(5);
    const result = await checkout(
      session,
      sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]),
      testContext(),
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("never blocks the Owner", async () => {
    const session = await owner();
    await closeOnSaturday();
    expect((await openShift(session, { openingCash: 0 }, testContext(), NOW)).ok).toBe(true);
    const { variantId } = await product(5);
    const result = await checkout(
      session,
      sale([{ variantId, qty: 1 }], [{ method: "CASH", amount: 10_000 }]),
      testContext(),
      NOW,
    );
    expect(result.ok).toBe(true);
  });
});

describe("roll products at the POS (FR-ROL-02/04, ADR-0023)", () => {
  const sizePrices = { "93x47": 50_000, "100x70": 60_000, "50x140": 55_000, "100x140": 110_000 };

  /** A roll product priced 100.000 per meter, cost 40.000, with 5 m of roll. */
  async function rollProduct() {
    const session = await owner();
    const created = await createProduct(
      session,
      {
        name: "Karpet Roll",
        price: 100_000,
        unit: "pcs",
        trackStock: true,
        sku: "ROLL-1",
        minStock: 0,
        sizePrices,
      },
      testContext(),
    );
    if (!created.ok) throw new Error(created.reason);
    const rows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, created.id));
    const roll = rows.find((row) => row.parentId === null);
    const piece = (size: string) => rows.find((row) => row.size === size)?.id ?? "";
    await receiveStock(session, roll?.id ?? "", { qty: 500, note: "" }, testContext());
    await countStock(session, piece("93x47"), { counted: 3, reason: "awal" }, testContext());
    return { rollId: roll?.id ?? "", piece };
  }

  it("prices pieces per size and a custom cut per meter, taking cm off the roll", async () => {
    const session = await cashier();
    await openedShift(session);
    const { rollId, piece } = await rollProduct();

    const result = await checkout(
      session,
      sale(
        [
          { variantId: piece("93x47"), qty: 2 },
          { variantId: rollId, qty: 2, lengthCm: 90 },
        ],
        [{ method: "CASH", amount: 280_000 }],
      ),
      testContext(),
      NOW,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.grandTotal).toBe(280_000);

    const items = await db.select().from(saleItems).where(eq(saleItems.saleId, result.saleId));
    expect(
      items.map(({ unitPrice, unitCost, qty, lengthCm }) => ({
        unitPrice,
        unitCost,
        qty,
        lengthCm,
      })),
    ).toEqual([
      { unitPrice: 50_000, unitCost: 0, qty: 2, lengthCm: null },
      { unitPrice: 90_000, unitCost: 0, qty: 2, lengthCm: 90 },
    ]);
    expect(items[0]?.detailsSnapshot).toBe("93cm x 47cm");
    expect(await stockOf(rollId)).toBe(320);
    expect(await stockOf(piece("93x47"))).toBe(1);
  });

  it("refuses a roll without a length, a length on a piece, and a cut longer than the roll", async () => {
    const session = await cashier();
    await openedShift(session);
    const { rollId, piece } = await rollProduct();
    const paid = (amount: number) => [{ method: "CASH" as const, amount }];
    expect(
      await checkout(
        session,
        sale([{ variantId: rollId, qty: 1 }], paid(100_000)),
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "invalid-items" });
    expect(
      await checkout(
        session,
        sale([{ variantId: piece("93x47"), qty: 1, lengthCm: 50 }], paid(50_000)),
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "invalid-items" });
    expect(
      await checkout(
        session,
        sale([{ variantId: rollId, qty: 1, lengthCm: 501 }], paid(501_000)),
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "insufficient-stock", variantId: rollId, available: 500 });
  });
});
