import "server-only";

import { and, desc, eq, isNull, ne, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { cashExpenses, kasbons, payments, sales, shifts, users } from "@/db/schema";

import { depositedDuring } from "./drawer";

const shiftColumns = {
  id: shifts.id,
  userId: shifts.userId,
  cashierName: users.name,
  kind: shifts.kind,
  openedAt: shifts.openedAt,
  openingCash: shifts.openingCash,
  carriedCash: shifts.carriedCash,
  closedAt: shifts.closedAt,
  expectedCash: shifts.expectedCash,
  countedCash: shifts.countedCash,
  variance: shifts.variance,
  note: shifts.note,
};

export async function findOpenShift(executor: Executor, userId: string) {
  const [row] = await executor
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .where(and(eq(shifts.userId, userId), isNull(shifts.closedAt)))
    .limit(1);
  return row;
}

/** Shifts other cashiers still have open, oldest first. */
export async function findOtherOpenShifts(executor: Executor, userId: string) {
  return executor
    .select({ id: shifts.id, cashierName: users.name, openedAt: shifts.openedAt })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .where(and(isNull(shifts.closedAt), ne(shifts.userId, userId)))
    .orderBy(shifts.openedAt);
}

/** Locks the user's open shift for closing (no concurrent double close). */
export async function lockOpenShift(executor: Executor, userId: string) {
  const [row] = await executor
    .select({
      id: shifts.id,
      kind: shifts.kind,
      openingCash: shifts.openingCash,
      carriedCash: shifts.carriedCash,
    })
    .from(shifts)
    .where(and(eq(shifts.userId, userId), isNull(shifts.closedAt)))
    .for("update");
  return row;
}

export async function findShift(id: string) {
  const [row] = await db
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .where(eq(shifts.id, id))
    .limit(1);
  return row;
}

export async function insertShift(
  executor: Executor,
  values: Pick<
    typeof shifts.$inferInsert,
    "userId" | "kind" | "openingCash" | "carriedCash" | "carriedFromShiftId"
  >,
): Promise<string> {
  const [row] = await executor.insert(shifts).values(values).returning({ id: shifts.id });
  if (!row) throw new Error("Shift insert returned no row");
  return row.id;
}

export async function closeShiftRow(
  executor: Executor,
  id: string,
  values: { expectedCash: number; countedCash: number; variance: number; note: string | null },
): Promise<void> {
  await executor
    .update(shifts)
    .set({ ...values, closedAt: new Date() })
    .where(eq(shifts.id, id));
}

/**
 * Per-shift figures (FR-SHF-03/04): settled payments per method on
 * non-voided sales, sale and void counts, store credit given, and store
 * credit payments taken in this shift, cash paid out as staff expenses
 * (FR-EXP-03) and cash deposited at the ATM while it was open (ADR-0032). A payment still awaiting approval
 * counts because the money is already in hand; a rejected one does not
 * (FR-KSB-03/04).
 */
export async function shiftTotals(executor: Executor, shiftId: string) {
  const byMethod = await executor
    .select({
      method: payments.method,
      total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    })
    .from(payments)
    .innerJoin(sales, eq(sales.id, payments.saleId))
    .where(
      and(eq(sales.shiftId, shiftId), ne(sales.status, "VOIDED"), eq(payments.status, "SETTLED")),
    )
    .groupBy(payments.method);

  const [counts] = await executor
    .select({
      sales: sql<number>`count(*) filter (where ${sales.status} <> 'VOIDED')`.mapWith(Number),
      voids: sql<number>`count(*) filter (where ${sales.status} = 'VOIDED')`.mapWith(Number),
      revenue:
        sql<number>`coalesce(sum(${sales.grandTotal}) filter (where ${sales.status} <> 'VOIDED'), 0)`.mapWith(
          Number,
        ),
    })
    .from(sales)
    .where(eq(sales.shiftId, shiftId));

  const [credit] = await executor
    .select({ total: sql<number>`coalesce(sum(${kasbons.total}), 0)`.mapWith(Number) })
    .from(kasbons)
    .innerJoin(sales, eq(sales.id, kasbons.saleId))
    .where(and(eq(sales.shiftId, shiftId), ne(sales.status, "VOIDED")));

  const collected = await executor
    .select({
      method: payments.method,
      total: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(and(eq(payments.shiftId, shiftId), ne(payments.status, "FAILED")))
    .groupBy(payments.method);

  const [spent] = await executor
    .select({ total: sql<number>`coalesce(sum(${cashExpenses.amount}), 0)`.mapWith(Number) })
    .from(cashExpenses)
    .where(eq(cashExpenses.shiftId, shiftId));

  const deposited = await depositedDuring(executor, shiftId);

  return {
    expenses: spent?.total ?? 0,
    deposited,
    kasbonIssued: credit?.total ?? 0,
    kasbonCollected: Object.fromEntries(collected.map((row) => [row.method, row.total])) as Partial<
      Record<(typeof collected)[number]["method"], number>
    >,
    byMethod: Object.fromEntries(byMethod.map((row) => [row.method, row.total])) as Partial<
      Record<(typeof byMethod)[number]["method"], number>
    >,
    salesCount: counts?.sales ?? 0,
    voidCount: counts?.voids ?? 0,
    revenue: counts?.revenue ?? 0,
  };
}

/** Shift history, newest first; restricted to one cashier unless `userId` is null. */
export async function queryShifts(userId: string | null, page: number, pageSize: number) {
  const conditions: SQL[] = [];
  if (userId) conditions.push(eq(shifts.userId, userId));
  return db
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .where(and(...conditions))
    .orderBy(desc(shifts.openedAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
}
