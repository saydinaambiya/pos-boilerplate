import "server-only";

import { db, type Executor } from "@/db/client";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import { startOfNextZonedDay, startOfZonedDay } from "@/lib/format/zoned-time";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import {
  applyStockDelta,
  findVariantStock,
  insertMovement,
  lockVariant,
  queryLowStock,
  queryMovements,
  queryStockGroups,
  queryStockPieces,
  type StockMovementType,
  updateMinStock,
} from "./repository";
import type {
  CountStockInput,
  MovementFilters,
  PieceMinimumInput,
  ReceiveStockInput,
  StockFilters,
  WriteOffStockInput,
} from "./schemas";

export const STOCK_PAGE_SIZE = 50;
export const MOVEMENT_PAGE_SIZE = 50;

export type StockResult =
  | { ok: true; movementId: string; qtyDelta: number; stockAfter: number }
  | { ok: false; reason: "not-found" | "not-tracked" | "cut-only" }
  | { ok: false; reason: "insufficient-stock"; available: number };

export type StockMovementInput = {
  variantId: string;
  type: StockMovementType;
  actorId: string | null;
  reason?: string | null;
  reference?: { type: string; id: string };
} & ({ qtyDelta: number } | { countedQty: number });

/**
 * The single write path for stock (FR-STK-01..04): locks the variant,
 * applies the delta with a conditional update and appends the ledger row,
 * all inside the caller's transaction. Pass `countedQty` for a stock count;
 * the delta is then computed under the lock so concurrent sales are not lost.
 * Other modules (POS, online orders) call this from their own transactions.
 */
export async function recordStockMovement(
  tx: Executor,
  input: StockMovementInput,
  options: { allowNegative: boolean },
): Promise<StockResult> {
  const variant = await lockVariant(tx, input.variantId);
  if (!variant) return { ok: false, reason: "not-found" };
  if (!variant.trackStock) return { ok: false, reason: "not-tracked" };

  const qtyDelta = "countedQty" in input ? input.countedQty - variant.stockQty : input.qtyDelta;
  const stockAfter = await applyStockDelta(tx, input.variantId, qtyDelta, options.allowNegative);
  if (stockAfter === undefined) {
    return { ok: false, reason: "insufficient-stock", available: variant.stockQty };
  }

  const movementId = await insertMovement(tx, {
    variantId: input.variantId,
    type: input.type,
    qtyDelta,
    stockAfter,
    reason: input.reason ?? null,
    referenceType: input.reference?.type ?? null,
    referenceId: input.reference?.id ?? null,
    actorId: input.actorId,
  });
  return { ok: true, movementId, qtyDelta, stockAfter };
}

type ManualMovement =
  | { type: "IN"; qtyDelta: number; reason: string | null }
  | { type: "ADJUSTMENT"; countedQty: number; reason: string }
  | { type: "WRITE_OFF"; qtyDelta: number; reason: string };

/** Manual movements share one audited transaction (FR-AUD-02). */
async function manualMovement(
  session: Session,
  variantId: string,
  movement: ManualMovement,
  context: RequestContext,
): Promise<StockResult> {
  assertPermission(session, "stock:adjust");
  const { allowNegativeStock } = await readSetting("operations");
  return db.transaction(async (tx) => {
    if (movement.type === "IN" && (await lockVariant(tx, variantId))?.isPiece) {
      return { ok: false as const, reason: "cut-only" as const };
    }
    const result = await recordStockMovement(
      tx,
      { variantId, actorId: session.user.id, ...movement },
      { allowNegative: allowNegativeStock },
    );
    if (!result.ok) return result;
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "stock.moved",
        entity: "product-variant",
        entityId: variantId,
        diff: {
          type: movement.type,
          qtyDelta: result.qtyDelta,
          stockAfter: result.stockAfter,
          reason: movement.reason,
        },
      },
      context,
    );
    return result;
  });
}

/**
 * Goods received (`IN`). A roll receives centimetres; its pieces only come
 * from cutting it (FR-ROL-03).
 */
export function receiveStock(
  session: Session,
  variantId: string,
  input: ReceiveStockInput,
  context: RequestContext,
): Promise<StockResult> {
  return manualMovement(
    session,
    variantId,
    { type: "IN", qtyDelta: input.qty, reason: input.note === "" ? null : input.note },
    context,
  );
}

/** Stock count: records the difference to the counted quantity as `ADJUSTMENT` (FR-STK-05). */
export function countStock(
  session: Session,
  variantId: string,
  input: CountStockInput,
  context: RequestContext,
): Promise<StockResult> {
  return manualMovement(
    session,
    variantId,
    { type: "ADJUSTMENT", countedQty: input.counted, reason: input.reason },
    context,
  );
}

/** Damaged or lost goods (`WRITE_OFF`). */
export function writeOffStock(
  session: Session,
  variantId: string,
  input: WriteOffStockInput,
  context: RequestContext,
): Promise<StockResult> {
  return manualMovement(
    session,
    variantId,
    { type: "WRITE_OFF", qtyDelta: -input.qty, reason: input.reason },
    context,
  );
}

/**
 * Stock grouped per product, motif and colour: each roll or plain variant
 * with the pieces cut from it that pass the filters (FR-STK-08).
 */
export async function getStockLevels(session: Session, filters: StockFilters) {
  assertPermission(session, "page:stock");
  const rows = await queryStockGroups(filters, STOCK_PAGE_SIZE);
  const heads = rows.slice(0, STOCK_PAGE_SIZE);
  const pieces = await queryStockPieces(
    heads.filter((head) => head.isRoll).map((head) => head.variantId),
    filters,
  );
  return {
    groups: heads.map((head) => ({
      ...head,
      pieces: pieces.filter((item) => item.parentId === head.variantId),
    })),
    hasNextPage: rows.length > STOCK_PAGE_SIZE,
  };
}

/** The one piece size whose minimum is kept, as it must always be in stock (FR-STK-09). */
export const MINIMUM_PIECE_SIZE = "93x47";

/** Whether a stock row is the 93×47 piece that takes a minimum (FR-STK-09). */
export function takesPieceMinimum(item: {
  parentId: string | null;
  size: string | null;
  isDefect: boolean;
}): boolean {
  return item.parentId !== null && item.size === MINIMUM_PIECE_SIZE && !item.isDefect;
}

export type PieceMinimumResult = { ok: true } | { ok: false; reason: "not-found" };

/**
 * Sets the minimum stock of a 93×47 piece so it is flagged when low;
 * other pieces keep none (FR-STK-09).
 */
export async function setPieceMinimum(
  session: Session,
  variantId: string,
  input: PieceMinimumInput,
  context: RequestContext,
): Promise<PieceMinimumResult> {
  assertPermission(session, "stock:adjust");
  return db.transaction(async (tx) => {
    const variant = await findVariantStock(variantId, tx);
    if (!variant?.isActive || !takesPieceMinimum(variant)) {
      return { ok: false as const, reason: "not-found" as const };
    }
    if (variant.minStock === input.minStock) return { ok: true as const };
    await updateMinStock(tx, variantId, input.minStock);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "stock.minimum-set",
        entity: "product-variant",
        entityId: variantId,
        diff: { minStock: { from: variant.minStock, to: input.minStock } },
      },
      context,
    );
    return { ok: true as const };
  });
}

/** Whether a variant's quantities are roll centimetres (ADR-0023); callers checked access. */
export async function stockIsRoll(variantId: string): Promise<boolean> {
  return (await findVariantStock(variantId))?.isRoll ?? false;
}

export async function getVariantStock(session: Session, variantId: string) {
  assertPermission(session, "page:stock");
  return findVariantStock(variantId);
}

/** Low-stock variants for the dashboard (FR-STK-07). */
export async function getLowStock(session: Session, limit = 10) {
  assertPermission(session, "page:stock");
  return queryLowStock(limit);
}

/** Movement history with type and store-time-zone date filters (FR-STK-06). */
export async function getMovements(session: Session, variantId: string, filters: MovementFilters) {
  assertPermission(session, "page:stock");
  const { timeZone } = await readSetting("operations");
  const from = filters.from ? startOfZonedDay(filters.from, timeZone) : null;
  const until = filters.to ? startOfNextZonedDay(filters.to, timeZone) : null;
  const rows = await queryMovements({
    variantId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(from ? { from } : {}),
    ...(until ? { until } : {}),
    ...(filters.cursor ? { before: filters.cursor } : {}),
    includeArchived: filters.archived === "1",
    limit: MOVEMENT_PAGE_SIZE + 1,
  });
  const movements = rows.slice(0, MOVEMENT_PAGE_SIZE);
  const last = movements.at(-1);
  return {
    movements,
    nextCursor: rows.length > MOVEMENT_PAGE_SIZE && last ? last.id : null,
  };
}
