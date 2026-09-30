import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { type Executor } from "@/db/client";
import {
  bankAccounts,
  cashDepositRevisions,
  cashDeposits,
  type DepositSnapshot,
  shifts,
  users,
} from "@/db/schema";

export async function findActiveBankAccount(executor: Executor, id: string) {
  const [row] = await executor
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, id), eq(bankAccounts.isActive, true)));
  return row;
}

export async function insertDeposit(
  executor: Executor,
  values: typeof cashDeposits.$inferInsert,
): Promise<string> {
  const [row] = await executor
    .insert(cashDeposits)
    .values(values)
    .returning({ id: cashDeposits.id });
  if (!row) throw new Error("Deposit insert returned no row");
  return row.id;
}

/** A deposit not cancelled yet, locked, with the shift its cash left. */
export async function lockLiveDeposit(executor: Executor, id: string) {
  const [row] = await executor
    .select({
      day: cashDeposits.day,
      bankAccountId: cashDeposits.bankAccountId,
      amount: cashDeposits.amount,
      note: cashDeposits.note,
      shiftId: cashDeposits.shiftId,
      afterClose: cashDeposits.afterClose,
      shiftClosedAt: shifts.closedAt,
    })
    .from(cashDeposits)
    .leftJoin(shifts, eq(shifts.id, cashDeposits.shiftId))
    .where(and(eq(cashDeposits.id, id), isNull(cashDeposits.cancelledAt)))
    .for("update", { of: cashDeposits });
  return row;
}

export async function updateDepositRow(executor: Executor, id: string, values: DepositSnapshot) {
  await executor.update(cashDeposits).set(values).where(eq(cashDeposits.id, id));
}

export async function markDepositCancelled(executor: Executor, id: string, actorId: string) {
  await executor
    .update(cashDeposits)
    .set({ cancelledAt: new Date(), cancelledById: actorId })
    .where(eq(cashDeposits.id, id));
}

export async function insertRevision(
  executor: Executor,
  values: typeof cashDepositRevisions.$inferInsert,
) {
  await executor.insert(cashDepositRevisions).values(values);
}

/** The history of the given deposits, oldest first. */
export async function listRevisions(executor: Executor, depositIds: readonly string[]) {
  if (depositIds.length === 0) return [];
  return executor
    .select({
      id: cashDepositRevisions.id,
      depositId: cashDepositRevisions.depositId,
      kind: cashDepositRevisions.kind,
      before: cashDepositRevisions.before,
      after: cashDepositRevisions.after,
      reason: cashDepositRevisions.reason,
      actorName: users.name,
      createdAt: cashDepositRevisions.createdAt,
    })
    .from(cashDepositRevisions)
    .innerJoin(users, eq(users.id, cashDepositRevisions.actorId))
    .where(inArray(cashDepositRevisions.depositId, [...depositIds]))
    .orderBy(asc(cashDepositRevisions.createdAt));
}
