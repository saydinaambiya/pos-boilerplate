import "server-only";

import { and, desc, eq, isNull, ne, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { payments, sales, shifts, users } from "@/db/schema";

const shiftColumns = {
  id: shifts.id,
  userId: shifts.userId,
  cashierName: users.name,
  openedAt: shifts.openedAt,
  openingCash: shifts.openingCash,
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

/** Locks the user's open shift for closing (no concurrent double close). */
export async function lockOpenShift(executor: Executor, userId: string) {
  const [row] = await executor
    .select({ id: shifts.id, openingCash: shifts.openingCash })
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
  userId: string,
  openingCash: number,
): Promise<string> {
  const [row] = await executor
    .insert(shifts)
    .values({ userId, openingCash })
    .returning({ id: shifts.id });
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
 * non-voided sales, sale and void counts. One grouped query each.
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

  return {
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
