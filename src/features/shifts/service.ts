import "server-only";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import {
  closeShiftRow,
  findOpenShift,
  findOtherOpenShifts,
  findShift,
  insertShift,
  lockOpenShift,
  queryShifts,
  shiftTotals,
} from "./repository";
import type { CloseShiftInput, OpenShiftInput } from "./schemas";

export const SHIFT_PAGE_SIZE = 30;

type ShiftTotals = Awaited<ReturnType<typeof shiftTotals>>;

/** Cash that should be in the drawer: float, cash sales and cash store-credit payments (FR-SHF-03). */
function expectedCashOf(openingCash: number, totals: ShiftTotals): number {
  return openingCash + (totals.byMethod.CASH ?? 0) + (totals.kasbonCollected.CASH ?? 0);
}

export type ShiftResult =
  { ok: true; id: string } | { ok: false; reason: "already-open" | "no-open-shift" };

/** The caller's open shift with live totals, or null (FR-SHF-01). */
export async function getOpenShift(session: Session) {
  assertPermission(session, "page:pos");
  const shift = await findOpenShift(db, session.user.id);
  if (!shift) return null;
  const totals = await shiftTotals(db, shift.id);
  return { ...shift, totals, expectedCash: expectedCashOf(shift.openingCash, totals) };
}

/**
 * Other cashiers' open shifts, so someone opening a shift is warned who
 * already has one open and since when (FR-SHF-01).
 */
export async function getOtherOpenShifts(session: Session) {
  assertPermission(session, "page:pos");
  return findOtherOpenShifts(db, session.user.id);
}

/** Opens a shift with its cash float; one open shift per cashier (FR-SHF-02). */
export async function openShift(
  session: Session,
  input: OpenShiftInput,
  context: RequestContext,
): Promise<ShiftResult> {
  assertPermission(session, "page:pos");
  try {
    const id = await db.transaction(async (tx) => {
      const shiftId = await insertShift(tx, session.user.id, input.openingCash);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "shift.opened",
          entity: "shift",
          entityId: shiftId,
          diff: { openingCash: input.openingCash },
        },
        context,
      );
      return shiftId;
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "already-open" };
    throw error;
  }
}

/**
 * Closes the caller's shift: expected cash = opening float + cash sales +
 * cash store-credit payments; the variance against the counted cash is recorded (FR-SHF-03).
 * The shift row is locked so a concurrent sale cannot slip in unnoticed.
 */
export async function closeShift(
  session: Session,
  input: CloseShiftInput,
  context: RequestContext,
): Promise<ShiftResult> {
  assertPermission(session, "page:pos");
  return db.transaction(async (tx) => {
    const shift = await lockOpenShift(tx, session.user.id);
    if (!shift) return { ok: false, reason: "no-open-shift" } as const;
    const totals = await shiftTotals(tx, shift.id);
    const expectedCash = expectedCashOf(shift.openingCash, totals);
    const variance = input.countedCash - expectedCash;
    await closeShiftRow(tx, shift.id, {
      expectedCash,
      countedCash: input.countedCash,
      variance,
      note: input.note === "" ? null : input.note,
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
 * Shift report (FR-SHF-04). Cashiers see their own shifts; `report:view`
 * holders see every shift. Others get `undefined`, never another cashier's
 * data (NFR-SEC-07).
 */
export async function getShiftReport(session: Session, shiftId: string) {
  assertPermission(session, "page:pos");
  const shift = await findShift(shiftId);
  if (!shift) return undefined;
  if (shift.userId !== session.user.id && !session.permissions.has("report:view")) return undefined;
  const totals = await shiftTotals(db, shift.id);
  return {
    ...shift,
    totals,
    expectedCash: shift.expectedCash ?? expectedCashOf(shift.openingCash, totals),
  };
}

/** Own shifts, or all shifts for `report:view` holders. */
export async function listShifts(session: Session, page: number) {
  assertPermission(session, "page:pos");
  const scope = session.permissions.has("report:view") ? null : session.user.id;
  const rows = await queryShifts(scope, page, SHIFT_PAGE_SIZE);
  return { shifts: rows.slice(0, SHIFT_PAGE_SIZE), hasNextPage: rows.length > SHIFT_PAGE_SIZE };
}
