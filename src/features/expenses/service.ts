import "server-only";

import { db } from "@/db/client";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay, storeDate } from "@/lib/format/zoned-time";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import {
  findActiveUser,
  insertExpense,
  listRecipients,
  lockOpenShiftForExpense,
  queryExpenses,
} from "./repository";
import type { ExpenseInput } from "./schemas";

export type ExpenseResult =
  { ok: true; id: string } | { ok: false; reason: "no-open-shift" | "invalid-recipient" };

/**
 * Records a staff expense paid from the recorder's cash drawer (FR-EXP-01,
 * FR-EXP-03, ADR-0027). It needs an open shift, share-locked so the shift
 * cannot close mid-write, and lowers that shift's expected cash. Rows are
 * never edited, like payments.
 */
export async function recordExpense(
  session: Session,
  input: ExpenseInput,
  context: RequestContext,
): Promise<ExpenseResult> {
  assertPermission(session, "expense:record");
  return db.transaction(async (tx) => {
    const shift = await lockOpenShiftForExpense(tx, session.user.id);
    if (!shift) return { ok: false as const, reason: "no-open-shift" as const };
    if (input.recipientId && !(await findActiveUser(tx, input.recipientId))) {
      return { ok: false as const, reason: "invalid-recipient" as const };
    }
    const id = await insertExpense(tx, {
      shiftId: shift.id,
      actorId: session.user.id,
      recipientId: input.recipientId,
      category: input.category,
      amount: input.amount,
      note: input.note === "" ? null : input.note,
    });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "expense.recorded",
        entity: "cash-expense",
        entityId: id,
        diff: { ...input, shiftId: shift.id },
      },
      context,
    );
    return { ok: true as const, id };
  });
}

/** One store day's expenses with their total (FR-EXP-02). */
export async function getExpensesOfDay(session: Session, day?: string, now = new Date()) {
  assertPermission(session, "page:expenses");
  const { timeZone } = await readSetting("operations");
  const shown = day ?? storeDate(now, timeZone);
  const start = startOfZonedDay(shown, timeZone);
  const end = startOfNextZonedDay(shown, timeZone);
  if (!start || !end) throw new Error("Invalid day");
  const rows = await queryExpenses(start, end);
  return { day: shown, rows, total: rows.reduce((sum, row) => sum + row.amount, 0) };
}

/** Who can receive an expense. */
export async function getExpenseRecipients(session: Session) {
  assertPermission(session, "expense:record");
  return listRecipients();
}
