import "server-only";

import { and, asc, desc, eq, isNull, ne, or, type SQL, sql } from "drizzle-orm";

import { alias } from "drizzle-orm/pg-core";

import { db, type Executor } from "@/db/client";
import { cashExpenses, kasbons, payments, sales, shifts, users } from "@/db/schema";

import { depositedDuring, salesHandoverDuring } from "./drawer";
import type { ShiftKind } from "./kind";

const closers = alias(users, "closer");

const shiftColumns = {
  id: shifts.id,
  userId: shifts.userId,
  cashierName: users.name,
  kind: shifts.kind,
  openedAt: shifts.openedAt,
  openingCash: shifts.openingCash,
  openingNote: shifts.openingNote,
  carriedCash: shifts.carriedCash,
  closedAt: shifts.closedAt,
  closedByName: closers.name,
  expectedCash: shifts.expectedCash,
  countedCash: shifts.countedCash,
  variance: shifts.variance,
  note: shifts.note,
  handoverToShiftId: shifts.handoverToShiftId,
  handoverAfterClose: shifts.handoverAfterClose,
};

/** A drawer shift, or one from before shift kinds, which were all cashier shifts. */
const isDrawerShift = or(eq(shifts.kind, "DRAWER"), isNull(shifts.kind));

/**
 * Where to find the caller's open shift and which to take first
 * (ADR-0044): for a cashier the store's shared drawer shift, their own
 * first should several still be open from before sharing; for a
 * salesperson their own shift.
 */
export function openShiftScope(userId: string, kind: ShiftKind): { where: SQL; orderBy: SQL[] } {
  if (kind === "SALES") {
    return {
      where: and(eq(shifts.userId, userId), isNull(shifts.closedAt)) ?? sql`false`,
      orderBy: [asc(shifts.openedAt)],
    };
  }
  return {
    where: and(isNull(shifts.closedAt), isDrawerShift) ?? sql`false`,
    orderBy: [desc(sql`${shifts.userId} = ${userId}`), asc(shifts.openedAt)],
  };
}

export async function findOpenShift(executor: Executor, userId: string, kind: ShiftKind) {
  const scope = openShiftScope(userId, kind);
  const [row] = await executor
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .leftJoin(closers, eq(closers.id, shifts.closedBy))
    .where(scope.where)
    .orderBy(...scope.orderBy)
    .limit(1);
  return row;
}

/** Locks the caller's open shift for closing (no concurrent double close). */
export async function lockOpenShift(executor: Executor, userId: string, kind: ShiftKind) {
  const scope = openShiftScope(userId, kind);
  const [row] = await executor
    .select({
      id: shifts.id,
      kind: shifts.kind,
      openingCash: shifts.openingCash,
      carriedCash: shifts.carriedCash,
    })
    .from(shifts)
    .where(scope.where)
    .orderBy(...scope.orderBy)
    .limit(1)
    .for("update");
  return row;
}

export async function findShift(id: string) {
  const [row] = await db
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .leftJoin(closers, eq(closers.id, shifts.closedBy))
    .where(eq(shifts.id, id))
    .limit(1);
  return row;
}

export async function insertShift(
  executor: Executor,
  values: Pick<
    typeof shifts.$inferInsert,
    "userId" | "kind" | "openingCash" | "openingNote" | "carriedCash" | "carriedFromShiftId"
  >,
): Promise<string> {
  const [row] = await executor.insert(shifts).values(values).returning({ id: shifts.id });
  if (!row) throw new Error("Shift insert returned no row");
  return row.id;
}

export async function closeShiftRow(
  executor: Executor,
  id: string,
  values: {
    expectedCash: number;
    countedCash: number;
    variance: number;
    note: string | null;
    closedBy: string;
    handoverToShiftId?: string | null;
    handoverAfterClose?: boolean;
  },
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
 * (FR-EXP-03), cash handed over from sales shifts (ADR-0054) and cash
 * deposited at the ATM while it was open (ADR-0032). A payment still awaiting approval
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
  const salesHandovers = await salesHandoverDuring(executor, shiftId);

  return {
    expenses: spent?.total ?? 0,
    deposited,
    salesHandovers,
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

/**
 * Shift history of one kind, newest first: the store's drawer shifts, or
 * salespeople's shifts, restricted to one person unless `userId` is null
 * (ADR-0044).
 */
export async function queryShifts(
  kind: ShiftKind,
  userId: string | null,
  page: number,
  pageSize: number,
) {
  const conditions: SQL[] = [];
  const ofKind = kind === "DRAWER" ? isDrawerShift : eq(shifts.kind, "SALES");
  if (ofKind) conditions.push(ofKind);
  if (userId) conditions.push(eq(shifts.userId, userId));
  return db
    .select(shiftColumns)
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .leftJoin(closers, eq(closers.id, shifts.closedBy))
    .where(and(...conditions))
    .orderBy(desc(shifts.openedAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
}
