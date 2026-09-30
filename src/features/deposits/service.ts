import "server-only";

import { db, type Executor } from "@/db/client";
import type { DepositSnapshot } from "@/db/schema";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { storeDate } from "@/lib/format/zoned-time";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import {
  isCarried,
  lastClosedDrawerShift,
  lockDrawer,
  oldestOpenDrawerShift,
} from "@/features/shifts/drawer";

import {
  findActiveBankAccount,
  insertDeposit,
  insertRevision,
  lockLiveDeposit,
  markDepositCancelled,
  updateDepositRow,
} from "./repository";
import type { DepositEditInput, DepositInput } from "./schemas";

export type DepositResult =
  { ok: true; id: string } | { ok: false; reason: "future-day" | "invalid-account" };

/**
 * Records drawer cash paid in at an ATM (FR-RPT-07, ADR-0032). Only the
 * amount the machine accepted is recorded; what it rejected stays in the
 * drawer balance. The day cannot be in the future. The cash leaves the open
 * drawer shift, which then expects less at close, or else the last closed
 * one, so the next shift carries less over.
 */
export async function recordDeposit(
  session: Session,
  input: DepositInput,
  context: RequestContext,
  now = new Date(),
): Promise<DepositResult> {
  assertPermission(session, "cash:deposit");
  const { timeZone } = await readSetting("operations");
  if (input.day > storeDate(now, timeZone)) return { ok: false, reason: "future-day" };
  return db.transaction(async (tx) => {
    if (!(await findActiveBankAccount(tx, input.bankAccountId))) {
      return { ok: false as const, reason: "invalid-account" as const };
    }
    await lockDrawer(tx);
    const open = await oldestOpenDrawerShift(tx);
    const last = open ? undefined : await lastClosedDrawerShift(tx);
    const shiftId = open?.id ?? (last && !last.carried ? last.id : null);
    const id = await insertDeposit(tx, {
      ...input,
      shiftId,
      afterClose: !open && shiftId !== null,
      note: input.note === "" ? null : input.note,
      actorId: session.user.id,
    });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "deposit.recorded",
        entity: "cash-deposit",
        entityId: id,
        diff: { ...input, shiftId },
      },
      context,
    );
    return { ok: true as const, id };
  });
}

type LiveDeposit = NonNullable<Awaited<ReturnType<typeof lockLiveDeposit>>>;

/**
 * Whether the drawer moved on past a deposit, so its amount is final: its
 * shift closed while it counted, or a later shift carried the leftover it
 * lowered (ADR-0032).
 */
async function isSettled(executor: Executor, deposit: LiveDeposit): Promise<boolean> {
  const closedAt = deposit.shiftClosedAt;
  if (!deposit.shiftId || !closedAt) return false;
  return !deposit.afterClose || isCarried(executor, deposit.shiftId);
}

const snapshotOf = (deposit: LiveDeposit | DepositSnapshot): DepositSnapshot => ({
  day: deposit.day,
  bankAccountId: deposit.bankAccountId,
  amount: deposit.amount,
  note: deposit.note,
});

export type EditDepositResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-found" | "unchanged" | "settled" | "future-day" | "invalid-account";
    };

/**
 * Corrects a deposit in place, with the reason kept in its history
 * (FR-RPT-07, ADR-0032), so a correction never looks like a second
 * deposit. The day, account and note can always be corrected; the amount
 * only until the deposit is settled, because the drawer already counted
 * it. A newly chosen account must be active.
 */
export async function editDeposit(
  session: Session,
  id: string,
  input: DepositEditInput,
  context: RequestContext,
  now = new Date(),
): Promise<EditDepositResult> {
  assertPermission(session, "cash:deposit");
  const { timeZone } = await readSetting("operations");
  if (input.day > storeDate(now, timeZone)) return { ok: false, reason: "future-day" };
  return db.transaction(async (tx) => {
    await lockDrawer(tx);
    const deposit = await lockLiveDeposit(tx, id);
    if (!deposit) return { ok: false as const, reason: "not-found" as const };
    const before = snapshotOf(deposit);
    const after = snapshotOf({ ...input, note: input.note === "" ? null : input.note });
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return { ok: false as const, reason: "unchanged" as const };
    }
    if (after.amount !== before.amount && (await isSettled(tx, deposit))) {
      return { ok: false as const, reason: "settled" as const };
    }
    if (
      after.bankAccountId !== before.bankAccountId &&
      !(await findActiveBankAccount(tx, after.bankAccountId))
    ) {
      return { ok: false as const, reason: "invalid-account" as const };
    }
    await updateDepositRow(tx, id, after);
    await insertRevision(tx, {
      depositId: id,
      kind: "EDITED",
      before,
      after,
      reason: input.reason,
      actorId: session.user.id,
    });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "deposit.edited",
        entity: "cash-deposit",
        entityId: id,
        diff: { before, after, reason: input.reason },
      },
      context,
    );
    return { ok: true as const };
  });
}

export type CancelDepositResult = { ok: true } | { ok: false; reason: "not-found" | "settled" };

/**
 * Cancels a deposit that never happened, with the reason kept in its
 * history (FR-RPT-07). The cancelled row stays listed. A settled deposit
 * cannot be cancelled (ADR-0032).
 */
export async function cancelDeposit(
  session: Session,
  id: string,
  reason: string,
  context: RequestContext,
): Promise<CancelDepositResult> {
  assertPermission(session, "cash:deposit");
  return db.transaction(async (tx) => {
    await lockDrawer(tx);
    const deposit = await lockLiveDeposit(tx, id);
    if (!deposit) return { ok: false as const, reason: "not-found" as const };
    if (await isSettled(tx, deposit)) return { ok: false as const, reason: "settled" as const };
    await markDepositCancelled(tx, id, session.user.id);
    const before = snapshotOf(deposit);
    await insertRevision(tx, {
      depositId: id,
      kind: "CANCELLED",
      before,
      reason,
      actorId: session.user.id,
    });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "deposit.cancelled",
        entity: "cash-deposit",
        entityId: id,
        diff: { before, reason },
      },
      context,
    );
    return { ok: true as const };
  });
}
