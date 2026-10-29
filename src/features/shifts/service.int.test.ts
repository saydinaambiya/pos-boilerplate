import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { payments, sales, shifts } from "@/db/schema";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { Session } from "@/lib/auth/session";

import {
  closeShift,
  getDrawerCarry,
  getOpenShift,
  getShiftReport,
  listShifts,
  openShift,
} from "./service";

const cashier = () => signIn("kasir", "123456");
const colleague = () => signIn("kasir-baru", "111111");
const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

/** A salesperson without the cashier, as the seeded Sales role (ADR-0029). */
async function salesperson(): Promise<Session> {
  const session = await signIn("kasir-baru", "111111");
  return { ...session, permissions: new Set(["page:consignments", "consignment:sell"]) };
}

let invoiceSeq = 0;

/** Inserts a sale with payments directly; checkout itself arrives with the POS slice. */
async function recordSale(
  shiftId: string,
  cashierId: string,
  paid: { method: "CASH" | "TRANSFER"; amount: number }[],
  status: "COMPLETED" | "VOIDED" = "COMPLETED",
) {
  invoiceSeq += 1;
  const total = paid.reduce((sum, payment) => sum + payment.amount, 0);
  const [sale] = await db
    .insert(sales)
    .values({
      invoiceNo: `TEST-${String(invoiceSeq)}`,
      shiftId,
      cashierId,
      status,
      subtotal: total,
      itemDiscountTotal: 0,
      serviceRateBps: 0,
      serviceAmount: 0,
      ppnRateBps: 0,
      ppnAmount: 0,
      priceIncludesTax: false,
      grandTotal: total,
      paidTotal: total,
      idempotencyKey: `key-${String(invoiceSeq)}`,
    })
    .returning({ id: sales.id });
  await db.insert(payments).values(paid.map((payment) => ({ saleId: sale?.id ?? "", ...payment })));
}

beforeEach(resetDatabase);

describe("shifts (FR-SHF-01..04)", () => {
  it("opens one store shift that every cashier carries on in (ADR-0044)", async () => {
    const session = await cashier();
    expect(await getOpenShift(session)).toBeNull();
    const opened = await openShift(
      session,
      { openingCash: 200_000, note: "Uang kecil di amplop" },
      testContext(),
    );
    if (!opened.ok) throw new Error(opened.reason);
    expect(await openShift(session, { openingCash: 100_000 }, testContext())).toEqual({
      ok: false,
      reason: "already-open",
    });
    expect(await openShift(await colleague(), { openingCash: 0 }, testContext())).toEqual({
      ok: false,
      reason: "already-open",
    });
    expect(await getOpenShift(await colleague())).toMatchObject({
      id: opened.id,
      openingCash: 200_000,
      openingNote: "Uang kecil di amplop",
      cashierName: "Kasir",
    });
  });

  it("lets another cashier close the shared shift and records who did", async () => {
    const opened = await openShift(await cashier(), { openingCash: 50_000 }, testContext());
    if (!opened.ok) throw new Error(opened.reason);
    const closer = await colleague();
    expect(await closeShift(closer, { countedCash: 50_000, note: "" }, testContext())).toEqual({
      ok: true,
      id: opened.id,
    });
    const [row] = await db.select().from(shifts).where(eq(shifts.id, opened.id));
    expect(row).toMatchObject({ closedBy: closer.user.id, variance: 0 });
    expect(await getOpenShift(await cashier())).toBeNull();
  });

  it("keeps a salesperson's shift apart, with no opening cash (ADR-0044)", async () => {
    const store = await openShift(await cashier(), { openingCash: 100_000 }, testContext());
    if (!store.ok) throw new Error(store.reason);
    const seller = await salesperson();
    expect(await getOpenShift(seller)).toBeNull();
    const own = await openShift(seller, { openingCash: 75_000, note: "x" }, testContext());
    if (!own.ok) throw new Error(own.reason);
    expect(await getOpenShift(seller)).toMatchObject({
      id: own.id,
      kind: "SALES",
      openingCash: 0,
      openingNote: null,
    });
    expect((await getOpenShift(await cashier()))?.id).toBe(store.id);

    const boss = await owner();
    expect((await listShifts(boss, "DRAWER", 1)).shifts.map((shift) => shift.id)).toEqual([
      store.id,
    ]);
    expect((await listShifts(boss, "SALES", 1)).shifts.map((shift) => shift.id)).toEqual([own.id]);
    expect((await listShifts(await cashier(), "SALES", 1)).shifts).toHaveLength(0);
  });

  it("expects opening cash plus settled cash of non-voided sales and records the variance", async () => {
    const session = await cashier();
    const opened = await openShift(session, { openingCash: 200_000 }, testContext());
    if (!opened.ok) throw new Error(opened.reason);
    await recordSale(opened.id, session.user.id, [{ method: "CASH", amount: 50_000 }]);
    await recordSale(opened.id, session.user.id, [
      { method: "CASH", amount: 30_000 },
      { method: "TRANSFER", amount: 20_000 },
    ]);
    await recordSale(opened.id, session.user.id, [{ method: "CASH", amount: 99_000 }], "VOIDED");

    const live = await getOpenShift(session);
    expect(live).toMatchObject({ expectedCash: 280_000 });
    expect(live?.totals).toMatchObject({ salesCount: 2, voidCount: 1, revenue: 100_000 });

    const closed = await closeShift(
      session,
      { countedCash: 275_000, note: "Kurang kembalian" },
      testContext(),
    );
    if (!closed.ok) throw new Error(closed.reason);
    const [row] = await db.select().from(shifts).where(eq(shifts.id, closed.id));
    expect(row).toMatchObject({ expectedCash: 280_000, countedCash: 275_000, variance: -5000 });
    expect(row?.closedAt).not.toBeNull();

    expect(await closeShift(session, { countedCash: 0, note: "" }, testContext())).toEqual({
      ok: false,
      reason: "no-open-shift",
    });
    expect((await openShift(session, { openingCash: 0 }, testContext())).ok).toBe(true);
  });

  it("shows store shifts to every cashier, sales shifts only to their own (NFR-SEC-07)", async () => {
    const session = await cashier();
    const opened = await openShift(session, { openingCash: 100_000 }, testContext());
    if (!opened.ok) throw new Error(opened.reason);
    const seller = await salesperson();
    const own = await openShift(seller, { openingCash: 0 }, testContext());
    if (!own.ok) throw new Error(own.reason);

    expect(await getShiftReport(await colleague(), opened.id)).toMatchObject({ id: opened.id });
    expect(await getShiftReport(session, own.id)).toBeUndefined();
    expect(await getShiftReport(await owner(), own.id)).toMatchObject({ id: own.id });

    expect((await listShifts(await colleague(), "DRAWER", 1)).shifts).toHaveLength(1);
    expect((await listShifts(await owner(), "DRAWER", 1)).shifts).toHaveLength(1);
  });

  it("transfers sales cash to the drawer when a salesperson closes their shift (ADR-0054)", async () => {
    const store = await openShift(await cashier(), { openingCash: 100_000 }, testContext());
    if (!store.ok) throw new Error(store.reason);

    const seller = await salesperson();
    const own = await openShift(seller, { openingCash: 0 }, testContext());
    if (!own.ok) throw new Error(own.reason);

    await recordSale(own.id, seller.user.id, [{ method: "CASH", amount: 150_000 }]);

    const closeSales = await closeShift(
      seller,
      { countedCash: 150_000, note: "Setor uang penjualan sales" },
      testContext(),
    );
    if (!closeSales.ok) throw new Error(closeSales.reason);

    const [salesRow] = await db.select().from(shifts).where(eq(shifts.id, own.id));
    expect(salesRow).toMatchObject({
      handoverToShiftId: store.id,
      handoverAfterClose: false,
      countedCash: 150_000,
      variance: 0,
    });

    const storeLive = await getOpenShift(await cashier());
    expect(storeLive?.totals.salesHandovers).toBe(150_000);
    expect(storeLive?.expectedCash).toBe(250_000);
  });

  it("carries over sales cash handed over after drawer close into the next drawer shift (ADR-0054)", async () => {
    const store = await openShift(await cashier(), { openingCash: 50_000 }, testContext());
    if (!store.ok) throw new Error(store.reason);

    const seller = await salesperson();
    const own = await openShift(seller, { openingCash: 0 }, testContext());
    if (!own.ok) throw new Error(own.reason);

    const closeStore = await closeShift(
      await cashier(),
      { countedCash: 50_000, note: "" },
      testContext(),
    );
    if (!closeStore.ok) throw new Error(closeStore.reason);

    const closeSales = await closeShift(
      seller,
      { countedCash: 80_000, note: "Pulang malam" },
      testContext(),
    );
    if (!closeSales.ok) throw new Error(closeSales.reason);

    const [salesRow] = await db.select().from(shifts).where(eq(shifts.id, own.id));
    expect(salesRow).toMatchObject({
      handoverToShiftId: store.id,
      handoverAfterClose: true,
      countedCash: 80_000,
    });

    const carry = await getDrawerCarry(await cashier());
    expect(carry).toBe(130_000);
  });
});
