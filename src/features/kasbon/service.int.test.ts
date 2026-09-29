import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import {
  approvals,
  customers,
  kasbons,
  payments,
  productVariants,
  rolePermissions,
  roles,
  sales,
} from "@/db/schema";
import { cancelApproval, decideApproval } from "@/features/approvals/service";
import { createProduct } from "@/features/catalog/service";
import { checkout } from "@/features/checkout/service";
import { requestVoid } from "@/features/checkout/void-service";
import { createBankAccount } from "@/features/settings/service";
import { closeShift, getOpenShift, openShift } from "@/features/shifts/service";
import type { Session } from "@/lib/auth/session";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { KasbonCheckoutInput } from "./schemas";
import { getKasbon, getKasbonSummary, listKasbons, recordKasbonPayment } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const cashier = () => signIn("kasir", "123456");
const NOW = new Date("2026-09-26T03:00:00Z");

async function grant(...permissions: Permission[]) {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db
    .insert(rolePermissions)
    .values(permissions.map((permission) => ({ roleId: role?.id ?? "", permission })))
    .onConflictDoNothing();
}

/** A 100.000 rupiah untracked product. */
async function sellable() {
  const session = await owner();
  const product = await createProduct(
    session,
    {
      name: "Paket",
      price: 100_000,
      unit: "pcs",
      trackStock: false,
      sku: `PKT-${crypto.randomUUID().slice(0, 8)}`,
      minStock: 0,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  return variant?.id ?? "";
}

interface Credit {
  customer: { name: string; phone: string; note: string };
  dueDate: KasbonCheckoutInput["dueDate"];
}

const credit = (overrides: Partial<Credit> = {}): Credit => ({
  customer: { name: "Bu Sari", phone: "+6281234567890", note: "" },
  dueDate: null,
  ...overrides,
});

function sellOnCredit(
  session: Session,
  variantId: string,
  downPayment: number,
  kasbon: Credit | null = credit(),
  now = NOW,
) {
  return checkout(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      customer: kasbon
        ? { name: kasbon.customer.name, phone: kasbon.customer.phone }
        : { name: "Pembeli", phone: null },
      lines: [{ variantId, qty: 1 }],
      payments: downPayment > 0 ? [{ method: "CASH", amount: downPayment }] : [],
      ...(kasbon ? { kasbon: { note: kasbon.customer.note, dueDate: kasbon.dueDate } } : {}),
    },
    testContext(),
    now,
  );
}

async function kasbonOf(saleId: string) {
  const [row] = await db.select().from(kasbons).where(eq(kasbons.saleId, saleId));
  if (!row) throw new Error("kasbon expected");
  return row;
}

async function pendingFor(paymentKasbonId: string) {
  return db
    .select({ id: approvals.id, version: approvals.version, targetId: approvals.targetId })
    .from(approvals)
    .innerJoin(payments, eq(payments.installmentId, approvals.targetId))
    .where(and(eq(payments.kasbonId, paymentKasbonId), eq(approvals.status, "PENDING")));
}

beforeEach(resetDatabase);

describe("store credit at checkout (FR-PAY-05, FR-KSB-01/02)", () => {
  it("puts the remainder on credit and re-uses the customer by phone", async () => {
    await grant("kasbon:create");
    const session = await cashier();
    await openShift(session, { openingCash: 0 }, testContext());
    const variantId = await sellable();

    const first = await sellOnCredit(session, variantId, 30_000);
    if (!first.ok) throw new Error(first.reason);
    expect(first.kasbonTotal).toBe(70_000);
    const [sale] = await db.select().from(sales).where(eq(sales.id, first.saleId));
    expect(sale).toMatchObject({ status: "COMPLETED_WITH_KASBON", paidTotal: 30_000 });
    expect(await kasbonOf(first.saleId)).toMatchObject({
      total: 70_000,
      paidTotal: 0,
      balance: 70_000,
      status: "OPEN",
    });

    const second = await sellOnCredit(session, variantId, 0, {
      customer: { name: "Ibu Sari", phone: "+6281234567890", note: "Tetangga" },
      dueDate: "2026-10-10",
    });
    if (!second.ok) throw new Error(second.reason);
    const all = await db.select().from(customers);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: "Ibu Sari", note: "Tetangga" });
    expect(sale?.customerId).toBe(all[0]?.id);
  });

  it("needs kasbon:create, a real remainder and a due date from today", async () => {
    const session = await cashier();
    await openShift(session, { openingCash: 0 }, testContext());
    const variantId = await sellable();
    expect(await sellOnCredit(session, variantId, 0)).toEqual({
      ok: false,
      reason: "kasbon-forbidden",
    });

    await grant("kasbon:create");
    const allowed = await cashier();
    expect(await sellOnCredit(allowed, variantId, 100_000)).toEqual({
      ok: false,
      reason: "payment-mismatch",
    });
    expect(await sellOnCredit(allowed, variantId, 0, credit({ dueDate: "2026-09-25" }))).toEqual({
      ok: false,
      reason: "kasbon-due-date",
    });
    expect(await sellOnCredit(allowed, variantId, 50_000, null)).toEqual({
      ok: false,
      reason: "payment-mismatch",
    });
    expect(await db.select().from(kasbons)).toHaveLength(0);
  });

  it("keeps credit sales out of voids", async () => {
    const session = await owner();
    await openShift(session, { openingCash: 0 }, testContext());
    const sale = await sellOnCredit(session, await sellable(), 0);
    if (!sale.ok) throw new Error(sale.reason);
    expect(await requestVoid(session, sale.saleId, { reason: "Salah" }, testContext())).toEqual({
      ok: false,
      reason: "not-voidable",
    });
  });
});

describe("store credit payments (FR-KSB-03..05, BR-12, BR-13)", () => {
  async function creditSale() {
    const ownerSession = await owner();
    await openShift(ownerSession, { openingCash: 0 }, testContext());
    const sale = await sellOnCredit(ownerSession, await sellable(), 0);
    if (!sale.ok) throw new Error(sale.reason);
    return kasbonOf(sale.saleId);
  }

  it("reduces the balance only after approval and settles at zero", async () => {
    const kasbon = await creditSale();
    await grant("kasbon:pay", "page:kasbon");
    const session = await cashier();
    await openShift(session, { openingCash: 10_000 }, testContext());

    expect(
      await recordKasbonPayment(
        session,
        kasbon.id,
        { cash: 40_000, transfer: null },
        testContext(),
      ),
    ).toEqual({ ok: true, status: "PENDING" });
    expect((await kasbonOf(kasbon.saleId)).balance).toBe(100_000);
    expect((await getOpenShift(session))?.expectedCash).toBe(50_000);

    const [pending] = await pendingFor(kasbon.id);
    expect(
      await decideApproval(
        await owner(),
        pending?.id ?? "",
        { decision: "approve", note: "", version: pending?.version ?? 0 },
        testContext(),
      ),
    ).toEqual({ ok: true });
    expect(await kasbonOf(kasbon.saleId)).toMatchObject({
      paidTotal: 40_000,
      balance: 60_000,
      status: "PARTIALLY_PAID",
    });

    const ownerSession = await owner();
    expect(
      await recordKasbonPayment(
        ownerSession,
        kasbon.id,
        { cash: 60_000, transfer: null },
        testContext(),
      ),
    ).toEqual({ ok: true, status: "APPROVED" });
    expect(await kasbonOf(kasbon.saleId)).toMatchObject({ balance: 0, status: "SETTLED" });
    expect(
      await recordKasbonPayment(
        ownerSession,
        kasbon.id,
        { cash: 1, transfer: null },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "settled" });
  });

  it("caps an installment at the balance minus pending ones, also concurrently", async () => {
    const kasbon = await creditSale();
    await grant("kasbon:pay");
    const session = await cashier();
    await openShift(session, { openingCash: 0 }, testContext());

    await recordKasbonPayment(session, kasbon.id, { cash: 70_000, transfer: null }, testContext());
    expect(
      await recordKasbonPayment(
        session,
        kasbon.id,
        { cash: 40_000, transfer: null },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "exceeds-balance", available: 30_000 });

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        recordKasbonPayment(session, kasbon.id, { cash: 20_000, transfer: null }, testContext()),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await pendingFor(kasbon.id)).toHaveLength(2);
  });

  it("frees the amount again when a payment is rejected or withdrawn", async () => {
    const kasbon = await creditSale();
    await grant("kasbon:pay");
    const session = await cashier();
    await openShift(session, { openingCash: 0 }, testContext());
    await recordKasbonPayment(session, kasbon.id, { cash: 100_000, transfer: null }, testContext());
    const [first] = await pendingFor(kasbon.id);
    await decideApproval(
      await owner(),
      first?.id ?? "",
      { decision: "reject", note: "Uang belum diterima", version: first?.version ?? 0 },
      testContext(),
    );
    const [rejected] = await db
      .select()
      .from(payments)
      .where(eq(payments.installmentId, first?.targetId ?? ""));
    expect(rejected?.status).toBe("FAILED");
    expect((await getOpenShift(session))?.expectedCash).toBe(0);

    await recordKasbonPayment(session, kasbon.id, { cash: 100_000, transfer: null }, testContext());
    const [second] = await pendingFor(kasbon.id);
    await cancelApproval(session, second?.id ?? "", second?.version ?? 0, testContext());
    expect(await pendingFor(kasbon.id)).toHaveLength(0);
    expect((await kasbonOf(kasbon.saleId)).balance).toBe(100_000);
  });

  it("needs an open shift for cash and an active account for transfers", async () => {
    const kasbon = await creditSale();
    await grant("kasbon:pay");
    const session = await cashier();
    expect(
      await recordKasbonPayment(
        session,
        kasbon.id,
        { cash: 10_000, transfer: null },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "no-open-shift" });
    expect(
      await recordKasbonPayment(
        session,
        kasbon.id,
        {
          cash: 0,
          transfer: { amount: 10_000, bankAccountId: crypto.randomUUID() },
        },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "invalid-bank-account" });

    const bank = await createBankAccount(
      await owner(),
      { bankName: "BCA", accountNo: "123456", accountName: "Toko" },
      testContext(),
    );
    if (!bank.ok) throw new Error(bank.reason);
    expect(
      await recordKasbonPayment(
        session,
        kasbon.id,
        { cash: 0, transfer: { amount: 10_000, bankAccountId: bank.id } },
        testContext(),
      ),
    ).toEqual({ ok: true, status: "PENDING" });
  });
});

describe("split installments (FR-KSB-03, BR-12)", () => {
  it("files cash and transfer parts as one approval and settles them together", async () => {
    const ownerSession = await owner();
    await openShift(ownerSession, { openingCash: 0 }, testContext());
    const sale = await sellOnCredit(ownerSession, await sellable(), 0);
    if (!sale.ok) throw new Error(sale.reason);
    const kasbon = await kasbonOf(sale.saleId);
    const bank = await createBankAccount(
      ownerSession,
      { bankName: "BCA", accountNo: "123456", accountName: "Toko" },
      testContext(),
    );
    if (!bank.ok) throw new Error(bank.reason);
    await grant("kasbon:pay");
    const session = await cashier();
    await openShift(session, { openingCash: 0 }, testContext());

    expect(
      await recordKasbonPayment(
        session,
        kasbon.id,
        { cash: 30_000, transfer: { amount: 80_000, bankAccountId: bank.id } },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "exceeds-balance", available: 100_000 });
    expect(
      await recordKasbonPayment(
        session,
        kasbon.id,
        { cash: 30_000, transfer: { amount: 50_000, bankAccountId: bank.id } },
        testContext(),
      ),
    ).toEqual({ ok: true, status: "PENDING" });

    const pending = await pendingFor(kasbon.id);
    expect(pending).toHaveLength(2);
    expect(new Set(pending.map((row) => row.id)).size).toBe(1);
    expect((await getOpenShift(session))?.expectedCash).toBe(30_000);

    await decideApproval(
      ownerSession,
      pending[0]?.id ?? "",
      { decision: "approve", note: "", version: pending[0]?.version ?? 0 },
      testContext(),
    );
    expect(await kasbonOf(kasbon.saleId)).toMatchObject({ paidTotal: 80_000, balance: 20_000 });
    const detail = await getKasbon(ownerSession, kasbon.id, NOW);
    expect(detail?.installments).toHaveLength(1);
    expect(detail?.installments[0]).toMatchObject({ total: 80_000, approvalStatus: "APPROVED" });
    expect(detail?.installments[0]?.parts.map((part) => part.method).sort()).toEqual([
      "CASH",
      "TRANSFER",
    ]);
  });
});

describe("store credit list and aging (FR-KSB-06, FR-DSH-01)", () => {
  it("buckets outstanding balances by age and flags overdue credit", async () => {
    const session = await owner();
    await openShift(session, { openingCash: 0 }, testContext());
    const variantId = await sellable();
    const old = await sellOnCredit(
      session,
      variantId,
      0,
      credit({ dueDate: "2026-07-31" }),
      new Date("2026-07-01T03:00:00Z"),
    );
    const recent = await sellOnCredit(session, variantId, 60_000, credit());
    if (!old.ok || !recent.ok) throw new Error("sales expected");
    await db
      .update(kasbons)
      .set({ createdAt: new Date("2026-07-01T03:00:00Z") })
      .where(eq(kasbons.saleId, old.saleId));
    await db
      .update(kasbons)
      .set({ createdAt: new Date("2026-09-20T03:00:00Z") })
      .where(eq(kasbons.saleId, recent.saleId));

    const list = await listKasbons(session, { filter: "open", search: "", page: 1 }, NOW);
    expect(list.aging).toMatchObject({
      current: 40_000,
      days31to60: 0,
      over60: 100_000,
      count: 2,
      overdue: 1,
    });
    expect(list.kasbons.map((row) => [row.aging, row.due])).toEqual([
      ["over60", "overdue"],
      ["current", "none"],
    ]);
    expect(
      (await listKasbons(session, { filter: "overdue", search: "", page: 1 }, NOW)).kasbons,
    ).toHaveLength(1);
    expect(
      (await listKasbons(session, { filter: "all", search: "0812-3456", page: 1 }, NOW)).kasbons,
    ).toHaveLength(2);
    expect((await getKasbonSummary(session, NOW))?.total).toBe(140_000);

    const detail = await getKasbon(session, list.kasbons[0]?.id ?? "", NOW);
    expect(detail).toMatchObject({ ageDays: 87, available: 100_000, customerName: "Bu Sari" });
  });

  it("counts credit given and collected in the shift report", async () => {
    const session = await owner();
    await openShift(session, { openingCash: 5_000 }, testContext());
    const sale = await sellOnCredit(session, await sellable(), 25_000);
    if (!sale.ok) throw new Error(sale.reason);
    const kasbon = await kasbonOf(sale.saleId);
    await recordKasbonPayment(session, kasbon.id, { cash: 15_000, transfer: null }, testContext());
    const shift = await getOpenShift(session);
    expect(shift?.totals.kasbonIssued).toBe(75_000);
    expect(shift?.totals.kasbonCollected.CASH).toBe(15_000);
    expect(shift?.expectedCash).toBe(45_000);
    const closed = await closeShift(session, { countedCash: 45_000, note: "" }, testContext());
    expect(closed.ok).toBe(true);
  });
});
