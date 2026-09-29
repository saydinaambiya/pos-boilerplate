import "server-only";

import { db } from "@/db/client";
import { ensureDefectPiece } from "@/features/catalog/repository";
import { lockVariant } from "@/features/stock/repository";
import { recordStockMovement } from "@/features/stock/service";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import { cutExists, findRoll, listRollPieces, queryRecentCuts, queryRolls } from "./repository";
import type { CutRollInput, RollFilters } from "./schemas";

export const ROLL_PAGE_SIZE = 100;

export type CutResult =
  | { ok: true; usedCm: number; rollAfter: number; replayed: boolean }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "insufficient-roll"; available: number; needed: number };

/** Rolls back a cut with a business result. */
class CutAbort extends Error {
  constructor(readonly result: Extract<CutResult, { ok: false }>) {
    super(result.reason);
  }
}

export async function getRolls(session: Session, filters: RollFilters) {
  assertPermission(session, "page:cutting");
  return queryRolls(filters, ROLL_PAGE_SIZE);
}

/** A roll with its pieces, for the cut form. */
export async function getRoll(session: Session, id: string) {
  assertPermission(session, "page:cutting");
  const roll = await findRoll(db, id);
  if (!roll) return undefined;
  return { ...roll, pieces: await listRollPieces(db, id) };
}

export async function getRecentCuts(session: Session, limit = 30) {
  assertPermission(session, "page:cutting");
  return queryRecentCuts(limit);
}

/**
 * Cuts pieces from a roll (FR-ROL-03, ADR-0023). The user says how much
 * roll was cut off and what it yielded: the roll loses that length and each
 * size's piece gains its count, as `CUT` movements sharing the idempotency
 * key as reference. Offcuts are simply the difference. The roll can never
 * go negative, whatever `allowNegativeStock` says: you cannot cut cloth you
 * do not have. The roll is locked first, so a retried request finds the
 * first cut and replays. A defect cut books the pieces on each size's
 * defect piece, created on first use (FR-ROL-05).
 */
export async function cutRoll(
  session: Session,
  rollId: string,
  input: CutRollInput,
  context: RequestContext,
): Promise<CutResult> {
  assertPermission(session, "page:cutting");
  const usedCm = input.lengthCm;
  try {
    return await db.transaction(async (tx) => {
      const roll = await findRoll(tx, rollId);
      if (!roll || !(await lockVariant(tx, rollId))) {
        throw new CutAbort({ ok: false, reason: "not-found" });
      }
      if (await cutExists(tx, input.idempotencyKey)) {
        return { ok: true as const, usedCm, rollAfter: roll.stockQty, replayed: true };
      }
      const reference = { type: "roll-cut", id: input.idempotencyKey };
      const cut = await recordStockMovement(
        tx,
        {
          variantId: rollId,
          type: "CUT",
          qtyDelta: -usedCm,
          actorId: session.user.id,
          reference,
        },
        { allowNegative: false },
      );
      if (!cut.ok) {
        throw new CutAbort(
          cut.reason === "insufficient-stock"
            ? { ok: false, reason: "insufficient-roll", available: cut.available, needed: usedCm }
            : { ok: false, reason: "not-found" },
        );
      }
      const pieces = await listRollPieces(tx, rollId);
      for (const wanted of input.pieces) {
        const pieceId = input.defect
          ? await ensureDefectPiece(tx, { ...roll, isActive: true }, wanted.size)
          : pieces.find((candidate) => candidate.size === wanted.size && !candidate.isDefect)?.id;
        if (!pieceId) throw new CutAbort({ ok: false, reason: "not-found" });
        await recordStockMovement(
          tx,
          {
            variantId: pieceId,
            type: "CUT",
            qtyDelta: wanted.qty,
            actorId: session.user.id,
            reference,
          },
          { allowNegative: false },
        );
      }
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "stock.cut",
          entity: "product-variant",
          entityId: rollId,
          diff: {
            usedCm,
            rollAfter: cut.stockAfter,
            defect: input.defect,
            pieces: input.pieces,
          },
        },
        context,
      );
      return { ok: true as const, usedCm, rollAfter: cut.stockAfter, replayed: false };
    });
  } catch (error) {
    if (error instanceof CutAbort) return error.result;
    throw error;
  }
}
