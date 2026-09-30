import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { Executor } from "@/db/client";
import { cashDeposits, shifts } from "@/db/schema";

/**
 * Serialises changes to the store's one cash drawer (ADR-0032): opening or
 * closing a drawer shift and recording or cancelling a deposit. Released
 * when the transaction ends.
 */
export async function lockDrawer(executor: Executor): Promise<void> {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtext('cash-drawer'))`);
}

/** Open drawer shift that has been open longest, which a deposit is taken from. */
export async function oldestOpenDrawerShift(executor: Executor) {
  const [row] = await executor
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.kind, "DRAWER"), isNull(shifts.closedAt)))
    .orderBy(asc(shifts.openedAt))
    .limit(1);
  return row;
}

/**
 * The last closed drawer shift, whether a later shift already carried its
 * leftover, and that leftover: the counted cash less deposits taken from
 * the drawer after it closed.
 */
export async function lastClosedDrawerShift(executor: Executor) {
  const [row] = await executor
    .select({
      id: shifts.id,
      closedAt: shifts.closedAt,
      carried: sql<boolean>`exists (select 1 from "shifts" as "carrier" where "carrier"."carried_from_shift_id" = "shifts"."id")`,
      leftover:
        sql<number>`coalesce("shifts"."counted_cash", 0) - coalesce((select sum("cash_deposits"."amount") from "cash_deposits" where "cash_deposits"."shift_id" = "shifts"."id" and "cash_deposits"."cancelled_at" is null and "cash_deposits"."after_close"), 0)`.mapWith(
          Number,
        ),
    })
    .from(shifts)
    .where(and(eq(shifts.kind, "DRAWER"), isNotNull(shifts.closedAt)))
    .orderBy(desc(shifts.closedAt))
    .limit(1);
  return row;
}

/**
 * Cash a new drawer shift starts with on top of the float the cashier
 * enters (FR-SHF-02): the leftover of the last closed drawer shift, unless
 * a later shift already carried it.
 */
export async function drawerCarry(executor: Executor) {
  const last = await lastClosedDrawerShift(executor);
  if (!last || last.carried) return { fromShiftId: null, amount: 0 };
  return { fromShiftId: last.id, amount: last.leftover };
}

/** Deposits taken from a shift's drawer while it was open (FR-SHF-03). */
export async function depositedDuring(executor: Executor, shiftId: string): Promise<number> {
  const [row] = await executor
    .select({ total: sql<number>`coalesce(sum(${cashDeposits.amount}), 0)`.mapWith(Number) })
    .from(cashDeposits)
    .where(
      and(
        eq(cashDeposits.shiftId, shiftId),
        isNull(cashDeposits.cancelledAt),
        eq(cashDeposits.afterClose, false),
      ),
    );
  return row?.total ?? 0;
}

/** Whether a later shift carried the leftover of `shiftId`. */
export async function isCarried(executor: Executor, shiftId: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: shifts.id })
    .from(shifts)
    .where(eq(shifts.carriedFromShiftId, shiftId))
    .limit(1);
  return row !== undefined;
}
