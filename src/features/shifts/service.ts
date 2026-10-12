import "server-only";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { recordAudit } from "@/lib/audit/audit";
import { assertAnyPermission, assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { storeClosedFor } from "@/lib/settings/store-hours-guard";

import { drawerCarry, lockDrawer } from "./drawer";
import { type ShiftKind, shiftKindFor } from "./kind";
import {
  closeShiftRow,
  findOpenShift,
  findShift,
  insertShift,
  lockOpenShift,
  queryShifts,
  shiftTotals,
} from "./repository";
import type { CloseShiftInput, OpenShiftInput } from "./schemas";

export const SHIFT_PAGE_SIZE = 30;

/**
 * Who may keep a shift of their own: cashiers, and salespeople who take
 * money for the goods they carry without using the cashier (ADR-0029).
 */
const SHIFT_HOLDERS = ["page:pos", "consignment:sell"] as const;

type ShiftTotals = Awaited<ReturnType<typeof shiftTotals>>;

/**
 * Cash that should be in the drawer: the leftover carried from the last
 * drawer shift, the float, cash sales and cash store-credit payments, less
 * staff expenses paid out and ATM deposits (FR-SHF-03, FR-EXP-03, ADR-0032).
 */
function expectedCashOf(
  shift: { openingCash: number; carriedCash: number },
  totals: ShiftTotals,
): number {
  return (
    shift.carriedCash +
    shift.openingCash +
    (totals.byMethod.CASH ?? 0) +
    (totals.kasbonCollected.CASH ?? 0) -
    totals.expenses -
    totals.deposited
  );
}

/** A drawer shift is already open; cashiers carry on in it (ADR-0044). */
class ShiftAlreadyOpen extends Error {}

export type ShiftResult =
  | { ok: true; id: string }
  | { ok: false; reason: "already-open" | "no-open-shift" | "store-closed" };

/**
 * The caller's open shift with live totals, or null (FR-SHF-01): for a
 * cashier the store's shared drawer shift, whoever opened it (ADR-0044).
 */
export async function getOpenShift(session: Session) {
  assertAnyPermission(session, SHIFT_HOLDERS);
  const shift = await findOpenShift(db, session.user.id, shiftKindFor(session));
  if (!shift) return null;
  const totals = await shiftTotals(db, shift.id);
  return { ...shift, totals, expectedCash: expectedCashOf(shift, totals) };
}

/**
 * Cash left in the drawer that the caller's next shift would start with, on
 * top of the float they enter (FR-SHF-02); zero for a salesperson.
 */
export async function getDrawerCarry(session: Session): Promise<number> {
  assertAnyPermission(session, SHIFT_HOLDERS);
  if (shiftKindFor(session) !== "DRAWER") return 0;
  return (await drawerCarry(db)).amount;
}

/**
 * Opens a shift (FR-SHF-02). The store has one drawer shift at a time,
 * shared by every cashier (ADR-0044): it starts with the float and an
 * optional note on it, plus the cash the last drawer shift left behind,
 * once (ADR-0032). A salesperson's shift starts with no cash, because
 * they carry no money out. Employees cannot open one outside store hours
 * (FR-SET-09).
 */
export async function openShift(
  session: Session,
  input: OpenShiftInput,
  context: RequestContext,
  now = new Date(),
): Promise<ShiftResult> {
  assertAnyPermission(session, SHIFT_HOLDERS);
  if (await storeClosedFor(session, now)) return { ok: false, reason: "store-closed" };
  try {
    const id = await db.transaction(async (tx) => {
      const kind = shiftKindFor(session);
      const drawer = kind === "DRAWER";
      if (drawer) {
        await lockDrawer(tx);
        if (await findOpenShift(tx, session.user.id, kind)) throw new ShiftAlreadyOpen();
      }
      const carry = drawer ? await drawerCarry(tx) : { fromShiftId: null, amount: 0 };
      const openingCash = drawer ? input.openingCash : 0;
      const shiftId = await insertShift(tx, {
        userId: session.user.id,
        kind,
        openingCash,
        openingNote: drawer && input.note ? input.note : null,
        carriedCash: carry.amount,
        carriedFromShiftId: carry.fromShiftId,
      });
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "shift.opened",
          entity: "shift",
          entityId: shiftId,
          diff: { kind, openingCash, carriedCash: carry.amount },
        },
        context,
      );
      return shiftId;
    });
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ShiftAlreadyOpen || isUniqueViolation(error)) {
      return { ok: false, reason: "already-open" };
    }
    throw error;
  }
}

/**
 * Closes the caller's shift: expected cash as in `expectedCashOf`; the
 * variance against the counted cash is recorded (FR-SHF-03), and the
 * counted cash is what the next drawer shift carries over (ADR-0032).
 * Any cashier may close the shared drawer shift; who did is kept
 * (ADR-0044). The shift row is locked so a concurrent sale cannot slip in
 * unnoticed.
 */
export async function closeShift(
  session: Session,
  input: CloseShiftInput,
  context: RequestContext,
): Promise<ShiftResult> {
  assertAnyPermission(session, SHIFT_HOLDERS);
  return db.transaction(async (tx) => {
    const kind = shiftKindFor(session);
    if (kind === "DRAWER") await lockDrawer(tx);
    const shift = await lockOpenShift(tx, session.user.id, kind);
    if (!shift) return { ok: false, reason: "no-open-shift" } as const;
    const totals = await shiftTotals(tx, shift.id);
    const expectedCash = expectedCashOf(shift, totals);
    const variance = input.countedCash - expectedCash;
    await closeShiftRow(tx, shift.id, {
      expectedCash,
      countedCash: input.countedCash,
      variance,
      note: input.note === "" ? null : input.note,
      closedBy: session.user.id,
    });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "shift.closed",
        entity: "shift",
        entityId: shift.id,
        diff: { expectedCash, countedCash: input.countedCash, variance },
      },
      context,
    );
    return { ok: true, id: shift.id } as const;
  });
}

/**
 * Shift report (FR-SHF-04). Every cashier sees the store's drawer shifts,
 * which they share (ADR-0044); a salesperson's shift is only for them and
 * `report:view` holders. Others get `undefined` (NFR-SEC-07).
 */
export async function getShiftReport(session: Session, shiftId: string) {
  assertPermission(session, "page:pos");
  const shift = await findShift(shiftId);
  if (!shift) return undefined;
  const shared = shift.kind !== "SALES";
  if (!shared && shift.userId !== session.user.id && !session.permissions.has("report:view")) {
    return undefined;
  }
  const totals = await shiftTotals(db, shift.id);
  return {
    ...shift,
    totals,
    expectedCash: shift.expectedCash ?? expectedCashOf(shift, totals),
  };
}

/**
 * One kind of shift history, kept apart (ADR-0044): the store's drawer
 * shifts for every cashier, or salespeople's shifts, own only unless the
 * caller holds `report:view`.
 */
export async function listShifts(session: Session, kind: ShiftKind, page: number) {
  assertPermission(session, "page:pos");
  const scope =
    kind === "DRAWER" || session.permissions.has("report:view") ? null : session.user.id;
  const rows = await queryShifts(kind, scope, page, SHIFT_PAGE_SIZE);
  return { shifts: rows.slice(0, SHIFT_PAGE_SIZE), hasNextPage: rows.length > SHIFT_PAGE_SIZE };
}
