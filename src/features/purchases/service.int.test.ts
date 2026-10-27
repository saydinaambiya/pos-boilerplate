import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { payments, purchasePayments, purchases } from "@/db/schema";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { PurchaseCreateInput } from "./schemas";
import {
  createPurchase,
  deletePurchase,
  exportPurchases,
  getPurchase,
  listPurchases,
  recordPurchasePayment,
  removePurchasePayment,
  updatePurchase,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const cashier = () => signIn("kasir", "123456");
const NOW = new Date("2026-09-26T03:00:00Z");

const bill = (overrides: Partial<PurchaseCreateInput> = {}): PurchaseCreateInput => ({
  companyName: "PT Kain Jaya",
  invoiceNo: "INV-001",
  total: 1_000_000,
  orderDate: "2026-09-01",
  term: "CREDIT",
  paidNow: 0,
  method: "CASH",
  dueDate: "2026-09-20",
  note: "",
  ...overrides,
});

async function onlyPurchase() {
  const rows = await db.select().from(purchases);
  const row = rows[0];
  if (rows.length !== 1 || !row) throw new Error(`expected one purchase, got ${rows.length}`);
  return row;
}

beforeEach(resetDatabase);

describe("supplier bills (FR-PRB-01/02, ADR-0053)", () => {
  it("settles a cash bill at once, keeps a credit one owed and records the payment made", async () => {
    const session = await owner();
    const settled = await createPurchase(session, bill({ term: "CASH" }), testContext());
    if (!settled.ok) throw new Error(settled.reason);
    expect(await onlyPurchase()).toMatchObject({
      total: 1_000_000,
      paidTotal: 1_000_000,
      balance: 0,
      status: "SETTLED",
      dueDate: null,
    });
    const [firstPayment] = await db.select().from(purchasePayments);
    expect(firstPayment).toMatchObject({
      amount: 1_000_000,
      method: "CASH",
      paidOn: "2026-09-01",
    });

    const credit = await createPurchase(
      session,
      bill({ invoiceNo: "INV-002", term: "CREDIT", paidNow: 200_000 }),
      testContext(),
    );
    if (!credit.ok) throw new Error(credit.reason);
    const detail = await getPurchase(session, credit.id, NOW);
    expect(detail).toMatchObject({
      status: "PARTIALLY_PAID",
      paidTotal: 200_000,
      balance: 800_000,
      due: "overdue",
    });
    expect(detail?.payments).toHaveLength(1);
  });

  it("refuses a duplicate nota for the same company, ignoring case (FR-PRB-07)", async () => {
    const session = await owner();
    const first = await createPurchase(session, bill(), testContext());
    expect(first.ok).toBe(true);
    const second = await createPurchase(
      session,
      bill({ companyName: "pt kain jaya" }),
      testContext(),
    );
    expect(second).toEqual({ ok: false, reason: "duplicate-invoice" });
  });

  it("only lets purchase:manage holders write (Owner by default)", async () => {
    await expect(createPurchase(await cashier(), bill(), testContext())).rejects.toThrow();
    expect(await db.select().from(purchases)).toHaveLength(0);
  });

  it("accepts a bill dated in the past (FR-PRB-05)", async () => {
    const session = await owner();
    const result = await createPurchase(
      session,
      bill({ orderDate: "2026-01-15", dueDate: "2026-02-15" }),
      testContext(),
    );
    expect(result.ok).toBe(true);
    expect((await onlyPurchase()).orderDate).toBe("2026-01-15");
  });
});

describe("installments (FR-PRB-03)", () => {
  it("reduces the balance and settles at zero, off the cash drawer", async () => {
    const session = await owner();
    const created = await createPurchase(session, bill(), testContext());
    if (!created.ok) throw new Error(created.reason);

    const partial = await recordPurchasePayment(
      session,
      created.id,
      { amount: 400_000, paidOn: "2026-09-10", method: "TRANSFER", note: "" },
      testContext(),
      NOW,
    );
    expect(partial).toEqual({ ok: true, status: "PARTIALLY_PAID" });
    expect(await onlyPurchase()).toMatchObject({ paidTotal: 400_000, balance: 600_000 });

    const paid = await recordPurchasePayment(
      session,
      created.id,
      { amount: 600_000, paidOn: "2026-09-25", method: "CASH", note: "" },
      testContext(),
      NOW,
    );
    expect(paid).toEqual({ ok: true, status: "SETTLED" });
    expect(await onlyPurchase()).toMatchObject({ balance: 0, status: "SETTLED" });

    expect(
      await recordPurchasePayment(
        session,
        created.id,
        { amount: 1, paidOn: "2026-09-25", method: "CASH", note: "" },
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "settled" });

    /** Nothing was recorded as a sale payment, so no shift or report is touched (FR-PRB-06). */
    expect(await db.select().from(payments)).toHaveLength(0);
  });

  it("rejects an installment over the balance and an impossible date", async () => {
    const session = await owner();
    const created = await createPurchase(session, bill(), testContext());
    if (!created.ok) throw new Error(created.reason);

    expect(
      await recordPurchasePayment(
        session,
        created.id,
        { amount: 1_500_000, paidOn: "2026-09-10", method: "CASH", note: "" },
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "exceeds-balance", available: 1_000_000 });
    expect(
      await recordPurchasePayment(
        session,
        created.id,
        { amount: 10_000, paidOn: "2026-08-01", method: "CASH", note: "" },
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "invalid-date" });
    expect(
      await recordPurchasePayment(
        session,
        created.id,
        { amount: 10_000, paidOn: "2026-10-01", method: "CASH", note: "" },
        testContext(),
        NOW,
      ),
    ).toEqual({ ok: false, reason: "invalid-date" });
  });

  it("removes an installment and recalculates the bill", async () => {
    const session = await owner();
    const created = await createPurchase(session, bill({ paidNow: 300_000 }), testContext());
    if (!created.ok) throw new Error(created.reason);
    const [payment] = await db.select().from(purchasePayments);
    expect(await removePurchasePayment(session, payment?.id ?? "", testContext())).toEqual({
      ok: true,
      status: "OPEN",
    });
    expect(await onlyPurchase()).toMatchObject({
      paidTotal: 0,
      balance: 1_000_000,
      status: "OPEN",
    });
  });
});

describe("editing and deleting (FR-PRB-01)", () => {
  it("cannot lower the total below what is paid, and keeps a due date while owed", async () => {
    const session = await owner();
    const created = await createPurchase(session, bill({ paidNow: 300_000 }), testContext());
    if (!created.ok) throw new Error(created.reason);

    const edit = {
      companyName: "PT Kain Jaya",
      invoiceNo: "INV-001",
      total: 200_000,
      orderDate: "2026-09-01",
      dueDate: "2026-09-20",
      note: "",
    };
    expect(await updatePurchase(session, created.id, edit, testContext())).toEqual({
      ok: false,
      reason: "total-below-paid",
    });
    expect(
      await updatePurchase(
        session,
        created.id,
        { ...edit, total: 1_200_000, dueDate: null },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "due-required" });
    expect(
      await updatePurchase(
        session,
        created.id,
        { ...edit, total: 1_200_000, dueDate: "2026-10-01", note: "Harga naik" },
        testContext(),
      ),
    ).toEqual({ ok: true });
    expect(await onlyPurchase()).toMatchObject({
      total: 1_200_000,
      paidTotal: 300_000,
      balance: 900_000,
      dueDate: "2026-10-01",
      note: "Harga naik",
    });
  });

  it("deletes the bill and its installments", async () => {
    const session = await owner();
    const created = await createPurchase(session, bill({ paidNow: 300_000 }), testContext());
    if (!created.ok) throw new Error(created.reason);
    expect(await deletePurchase(session, created.id, testContext())).toEqual({ ok: true });
    expect(await db.select().from(purchases)).toHaveLength(0);
    expect(await db.select().from(purchasePayments)).toHaveLength(0);
    expect(await deletePurchase(session, created.id, testContext())).toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("list and summary (FR-PRB-04)", () => {
  it("summarises total tagihan and sisa tagihan, flags overdue bills and searches by nota", async () => {
    const session = await owner();
    await createPurchase(
      session,
      bill({ invoiceNo: "LUNAS-1", term: "CASH", note: "Catatan tunai" }),
      testContext(),
    );
    await createPurchase(
      session,
      bill({
        invoiceNo: "HUTANG-1",
        term: "CREDIT",
        paidNow: 0,
        orderDate: "2026-09-15",
        dueDate: "2026-09-20",
        note: "Catatan kredit",
      }),
      testContext(),
    );

    const list = await listPurchases(session, { filter: "all", search: "", page: 1 }, NOW);
    expect(list.summary).toEqual({
      total: 2_000_000,
      outstanding: 1_000_000,
      count: 2,
      unpaidCount: 1,
      overdue: 1,
    });
    expect(list.purchases.map((row) => row.status)).toEqual(["OPEN", "SETTLED"]);
    expect(list.purchases.map((row) => row.note)).toEqual(["Catatan kredit", "Catatan tunai"]);
    expect(list.purchases[0]).toMatchObject({ due: "overdue" });

    expect(
      (await listPurchases(session, { filter: "overdue", search: "", page: 1 }, NOW)).purchases,
    ).toHaveLength(1);
    expect(
      (await listPurchases(session, { filter: "settled", search: "", page: 1 }, NOW)).purchases,
    ).toHaveLength(1);
    expect(
      (await listPurchases(session, { filter: "all", search: "HUTANG", page: 1 }, NOW)).purchases,
    ).toHaveLength(1);

    // Test date range filter
    const dateFiltered = await listPurchases(
      session,
      {
        filter: "all",
        search: "",
        from: "2026-09-10",
        to: "2026-09-20",
        page: 1,
      },
      NOW,
    );
    expect(dateFiltered.purchases).toHaveLength(1);
    expect(dateFiltered.purchases[0]?.invoiceNo).toBe("HUTANG-1");
    expect(dateFiltered.summary).toEqual({
      total: 1_000_000,
      outstanding: 1_000_000,
      count: 1,
      unpaidCount: 1,
      overdue: 1,
    });

    const outOfRange = await listPurchases(
      session,
      {
        filter: "all",
        search: "",
        from: "2026-08-01",
        to: "2026-08-31",
        page: 1,
      },
      NOW,
    );
    expect(outOfRange.purchases).toHaveLength(0);
    expect(outOfRange.summary).toEqual({
      total: 0,
      outstanding: 0,
      count: 0,
      unpaidCount: 0,
      overdue: 0,
    });
  });

  it("hides a settled bill marked archived unless asked for (FR-HK-04)", async () => {
    const session = await owner();
    const created = await createPurchase(session, bill({ term: "CASH" }), testContext());
    if (!created.ok) throw new Error(created.reason);
    await db
      .update(purchases)
      .set({ archivedAt: new Date(), archiveBatchId: crypto.randomUUID() })
      .where(eq(purchases.id, created.id));

    expect(
      (await listPurchases(session, { filter: "all", search: "", page: 1 }, NOW)).purchases,
    ).toHaveLength(0);
    expect(
      (
        await listPurchases(
          session,
          { filter: "all", search: "", page: 1, includeArchived: true },
          NOW,
        )
      ).purchases,
    ).toHaveLength(1);
  });

  it("exports filtered purchases as CSV lines (FR-PRB-04)", async () => {
    const session = await owner();
    await createPurchase(
      session,
      bill({ companyName: "PT Maju", invoiceNo: "INV-10", total: 500_000, note: "Nota kain" }),
      testContext(),
    );
    await createPurchase(
      session,
      bill({ companyName: "CV Sejahtera", invoiceNo: "INV-20", total: 300_000 }),
      testContext(),
    );

    const exported = await exportPurchases(session, { filter: "all", search: "Maju" }, "id", NOW);
    const lines = [...exported.lines];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Nota Faktur");
    expect(lines[1]).toContain("PT Maju");
    expect(lines[1]).toContain("Nota kain");
  });
});
