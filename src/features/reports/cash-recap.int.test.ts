import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE } from "@/config/permissions";
import { db } from "@/db/client";
import { productVariants, rolePermissions, roles, shifts } from "@/db/schema";
import { createProduct } from "@/features/catalog/service";
import { checkout } from "@/features/checkout/service";
import { cancelDeposit, editDeposit, recordDeposit } from "@/features/deposits/service";
import { recordExpense } from "@/features/expenses/service";
import { createBankAccount } from "@/features/settings/service";
import { closeShift, getDrawerCarry, getOpenShift, openShift } from "@/features/shifts/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { storeDate } from "@/lib/format/zoned-time";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { getCashRecap } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const TIME_ZONE = "Asia/Jakarta";

async function product() {
  const created = await createProduct(
    await owner(),
    { name: "Karpet", price: 50_000, unit: "pcs", trackStock: false, sku: "SKU-K", minStock: 0 },
    testContext(),
  );
  if (!created.ok) throw new Error(created.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, created.id));
  return variant?.id ?? "";
}

async function sell(
  session: Session,
  variantId: string,
  payment: { method: "CASH" | "TRANSFER"; amount: number; bankAccountId?: string },
) {
  const result = await checkout(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      customer: { name: "Pembeli", phone: null },
      lines: [{ variantId, qty: payment.amount / 50_000 }],
      payments: [payment],
    },
    testContext(),
  );
  if (!result.ok) throw new Error(result.reason);
}

async function deposit(session: Session, day: string, bankAccountId: string, amount: number) {
  const result = await recordDeposit(
    session,
    { day, bankAccountId, amount, note: "" },
    testContext(),
  );
  if (!result.ok) throw new Error(result.reason);
  return result.id;
}

/** Moves everything recorded so far one day back, as if it happened yesterday. */
async function backdateOneDay() {
  for (const statement of [
    sql`update shifts set opened_at = opened_at - interval '1 day', closed_at = closed_at - interval '1 day'`,
    sql`update sales set created_at = created_at - interval '1 day'`,
    sql`update payments set created_at = created_at - interval '1 day', updated_at = updated_at - interval '1 day'`,
    sql`update cash_expenses set created_at = created_at - interval '1 day'`,
    sql`update cash_deposits set created_at = created_at - interval '1 day'`,
  ]) {
    await db.execute(statement);
  }
}

beforeEach(resetDatabase);

describe("drawer carry-over, money recap and ATM deposits (FR-SHF-02, FR-RPT-06/07, ADR-0032)", () => {
  it("carries the undeposited cash into the next shift and the recap matches the drawer", async () => {
    const now = new Date();
    const today = storeDate(now, TIME_ZONE);
    const yesterday = storeDate(new Date(now.getTime() - 86_400_000), TIME_ZONE);
    const session = await owner();
    const account = await createBankAccount(
      session,
      { bankName: "BCA", accountNo: "1234567890", accountName: "Toko" },
      testContext(),
    );
    if (!account.ok) throw new Error(account.reason);
    const karpet = await product();
    expect(await getDrawerCarry(session)).toBe(0);

    await openShift(session, { openingCash: 200_000 }, testContext());
    await sell(session, karpet, { method: "CASH", amount: 100_000 });
    await sell(session, karpet, { method: "TRANSFER", amount: 50_000, bankAccountId: account.id });
    const expense = await recordExpense(
      session,
      { category: "DONATION", recipientId: null, amount: 20_000, note: "" },
      testContext(),
    );
    expect(expense.ok).toBe(true);
    const during = await deposit(session, yesterday, account.id, 70_000);
    expect((await getOpenShift(session))?.expectedCash).toBe(210_000);
    expect((await closeShift(session, { countedCash: 205_000, note: "" }, testContext())).ok).toBe(
      true,
    );

    const afterClose = await deposit(session, yesterday, account.id, 50_000);
    const mistake = await deposit(session, yesterday, account.id, 5_000);
    expect(await cancelDeposit(session, mistake, "Salah catat", testContext())).toEqual({
      ok: true,
    });
    expect(await cancelDeposit(session, during, "Salah catat", testContext())).toEqual({
      ok: false,
      reason: "settled",
    });
    expect(await getDrawerCarry(session)).toBe(155_000);
    await backdateOneDay();

    await openShift(session, { openingCash: 0 }, testContext());
    const [second] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.userId, session.user.id), sql`${shifts.closedAt} is null`));
    expect(second).toMatchObject({ kind: "DRAWER", carriedCash: 155_000 });
    expect(await getDrawerCarry(session)).toBe(0);
    expect(await cancelDeposit(session, afterClose, "Salah catat", testContext())).toEqual({
      ok: false,
      reason: "settled",
    });
    await sell(session, karpet, { method: "CASH", amount: 50_000 });
    await deposit(session, today, account.id, 40_000);
    expect((await getOpenShift(session))?.expectedCash).toBe(165_000);

    const before = await getCashRecap(session, { day: yesterday }, now);
    expect(before.moneyIn).toMatchObject({
      total: 150_000,
      account: 50_000,
      transfer: 50_000,
      cash: 100_000,
      salesCash: 0,
    });
    expect(before.drawer).toEqual({
      opening: 0,
      added: 200_000,
      cashIn: 100_000,
      expenses: 20_000,
      deposited: 120_000,
      variance: -5_000,
      balance: 155_000,
    });

    const current = await getCashRecap(session, {}, now);
    expect(current.drawer).toEqual({
      opening: 155_000,
      added: 0,
      cashIn: 50_000,
      expenses: 0,
      deposited: 40_000,
      variance: 0,
      balance: 165_000,
    });
    const month = await getCashRecap(session, { month: today.slice(0, 7) }, now);
    expect(month.drawer.balance).toBe(165_000);
    expect(month.days.at(-1)).toMatchObject({ day: today, cash: 50_000, balance: 165_000 });
  });

  it("corrects a deposit in place with a reason and keeps its history", async () => {
    const session = await owner();
    const bank = async (bankName: string, accountNo: string) => {
      const created = await createBankAccount(
        session,
        { bankName, accountNo, accountName: "Toko" },
        testContext(),
      );
      if (!created.ok) throw new Error(created.reason);
      return created.id;
    };
    const bca = await bank("BCA", "1111111111");
    const bri = await bank("BRI", "2222222222");
    const today = storeDate(new Date(), TIME_ZONE);
    await openShift(session, { openingCash: 100_000 }, testContext());
    const id = await deposit(session, today, bca, 30_000);
    const corrected = {
      day: today,
      bankAccountId: bca,
      amount: 25_000,
      note: "",
      reason: "Salah ketik",
    };

    expect(await editDeposit(session, id, corrected, testContext())).toEqual({ ok: true });
    expect(await editDeposit(session, id, corrected, testContext())).toEqual({
      ok: false,
      reason: "unchanged",
    });
    expect((await getOpenShift(session))?.expectedCash).toBe(75_000);
    await closeShift(session, { countedCash: 75_000, note: "" }, testContext());

    expect(await editDeposit(session, id, { ...corrected, amount: 20_000 }, testContext())).toEqual(
      { ok: false, reason: "settled" },
    );
    expect(
      await editDeposit(
        session,
        id,
        { ...corrected, bankAccountId: bri, reason: "Salah pilih rekening" },
        testContext(),
      ),
    ).toEqual({ ok: true });
    expect(await cancelDeposit(session, id, "Tidak jadi", testContext())).toEqual({
      ok: false,
      reason: "settled",
    });

    const [row] = (await getCashRecap(session, {})).deposits;
    expect(row).toMatchObject({ amount: 25_000, bankAccountId: bri, cancelledAt: null });
    expect(
      row?.revisions.map((revision) => [
        revision.kind,
        revision.before.amount,
        revision.after?.amount,
        revision.reason,
      ]),
    ).toEqual([
      ["EDITED", 30_000, 25_000, "Salah ketik"],
      ["EDITED", 25_000, 25_000, "Salah pilih rekening"],
    ]);
  });

  it("keeps a salesperson's cash out of the drawer", async () => {
    const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
    const roleId = role?.id ?? "";
    await db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permission, "page:pos")));
    await db.insert(rolePermissions).values({ roleId, permission: "consignment:sell" });
    const seller = await signIn("kasir", "123456");
    expect(await getDrawerCarry(seller)).toBe(0);
    expect((await openShift(seller, { openingCash: 10_000 }, testContext())).ok).toBe(true);
    const [row] = await db.select().from(shifts).where(eq(shifts.userId, seller.user.id));
    expect(row?.kind).toBe("SALES");

    const recap = await getCashRecap(await owner(), {});
    expect(recap.drawer.added).toBe(0);
  });

  it("refuses future days, inactive accounts and staff without cash:deposit", async () => {
    const session = await owner();
    const account = await createBankAccount(
      session,
      { bankName: "BRI", accountNo: "9876543210", accountName: "Toko" },
      testContext(),
    );
    if (!account.ok) throw new Error(account.reason);
    const now = new Date("2026-09-26T05:00:00Z");
    const input = { day: "2026-09-27", bankAccountId: account.id, amount: 10_000, note: "" };
    expect(await recordDeposit(session, input, testContext(), now)).toEqual({
      ok: false,
      reason: "future-day",
    });
    expect(
      await recordDeposit(
        session,
        { ...input, day: "2026-09-26", bankAccountId: crypto.randomUUID() },
        testContext(),
        now,
      ),
    ).toEqual({ ok: false, reason: "invalid-account" });

    const cashier = await signIn("kasir", "123456");
    await expect(recordDeposit(cashier, input, testContext(), now)).rejects.toThrow(ForbiddenError);
    await expect(getCashRecap(cashier, {}, now)).rejects.toThrow(ForbiddenError);
  });
});
