import "server-only";

import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type Executor } from "@/db/client";
import { cashExpenses, shifts, users } from "@/db/schema";

const recipients = alias(users, "recipient");

/** The user's open shift, share-locked so it is not closed mid-write (FR-SHF-01). */
export async function lockOpenShiftForExpense(executor: Executor, userId: string) {
  const [row] = await executor
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.userId, userId), isNull(shifts.closedAt)))
    .for("share");
  return row;
}

export async function insertExpense(
  executor: Executor,
  values: typeof cashExpenses.$inferInsert,
): Promise<string> {
  const [row] = await executor
    .insert(cashExpenses)
    .values(values)
    .returning({ id: cashExpenses.id });
  if (!row) throw new Error("Expense insert returned no row");
  return row.id;
}

/** Active accounts that can receive an expense, by name (FR-EXP-01). */
export async function listRecipients() {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.name));
}

export async function findActiveUser(executor: Executor, id: string) {
  const [row] = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.isActive, true)))
    .limit(1);
  return row;
}

/** Expenses in `[start, end)`, newest first, with recorder and recipient (FR-EXP-02). */
export async function queryExpenses(start: Date, end: Date) {
  return db
    .select({
      id: cashExpenses.id,
      createdAt: cashExpenses.createdAt,
      category: cashExpenses.category,
      amount: cashExpenses.amount,
      note: cashExpenses.note,
      actorName: users.name,
      recipientName: recipients.name,
    })
    .from(cashExpenses)
    .innerJoin(users, eq(users.id, cashExpenses.actorId))
    .leftJoin(recipients, eq(recipients.id, cashExpenses.recipientId))
    .where(and(gte(cashExpenses.createdAt, start), lt(cashExpenses.createdAt, end)))
    .orderBy(desc(cashExpenses.createdAt), desc(cashExpenses.id));
}

/** Total paid out of a shift's drawer (FR-EXP-03). */
export async function shiftExpenseTotal(executor: Executor, shiftId: string): Promise<number> {
  const [row] = await executor
    .select({
      total: sql<number>`coalesce(sum(${cashExpenses.amount}), 0)`.mapWith(Number),
    })
    .from(cashExpenses)
    .where(eq(cashExpenses.shiftId, shiftId));
  return row?.total ?? 0;
}
