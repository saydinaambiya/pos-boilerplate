import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { payments, sales, shifts } from "@/db/schema";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { closeShift, getOpenShift, getShiftReport, listShifts, openShift } from "./service";

const cashier = () => signIn("kasir", "123456");
const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

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
  it("opens one shift per cashier", async () => {
    const session = await cashier();
    expect(await getOpenShift(session)).toBeNull();
    const opened = await openShift(session, { openingCash: 200_000 }, testContext());
    expect(opened.ok).toBe(true);
    expect(await openShift(session, { openingCash: 100_000 }, testContext())).toEqual({
      ok: false,
      reason: "already-open",
    });
    expect((await getOpenShift(session))?.openingCash).toBe(200_000);
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

  it("shows reports only to their cashier or to report:view holders (NFR-SEC-07)", async () => {
    const session = await cashier();
    const opened = await openShift(session, { openingCash: 100_000 }, testContext());
    if (!opened.ok) throw new Error(opened.reason);

    const colleague = await signIn("kasir-baru", "111111");

    expect(await getShiftReport(session, opened.id)).toMatchObject({ id: opened.id });
    expect(await getShiftReport(colleague, opened.id)).toBeUndefined();
    expect(await getShiftReport(await owner(), opened.id)).toMatchObject({ id: opened.id });

    expect((await listShifts(colleague, 1)).shifts).toHaveLength(0);
    expect((await listShifts(await owner(), 1)).shifts).toHaveLength(1);
  });
});
