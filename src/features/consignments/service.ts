import "server-only";

import { db, type Executor } from "@/db/client";
import { uniqueViolationConstraint } from "@/db/errors";
import { variantSnapshotOf } from "@/features/catalog/schemas";
import { type CheckoutFailure, checkout } from "@/features/checkout/service";
import type { CheckoutInput } from "@/features/checkout/schemas";
import { recordStockMovement } from "@/features/stock/service";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { calculateSale } from "@/lib/money/calculate";
import { readSetting } from "@/lib/settings/store";
import { storeClosedFor } from "@/lib/settings/store-hours-guard";

import {
  closeConsignment,
  consignmentBalances,
  findBatchByKey,
  findConsignment,
  findTakeableVariants,
  insertBatch,
  insertItems,
  insertOpenConsignment,
  listBatches,
  listSalespeople,
  lockConsignment,
  lockOpenConsignment,
  queryConsignments,
  touchConsignment,
} from "./repository";
import type { ReduceGoodsInput, SettleGoodsInput, TakeGoodsInput } from "./schemas";

export type TakeResult =
  | { ok: true; consignmentId: string; replayed: boolean }
  | {
      ok: false;
      reason: "forbidden" | "invalid-salesperson" | "invalid-items" | "store-closed";
    }
  | { ok: false; reason: "insufficient-stock"; variantId: string; available: number };

type SettleReason =
  | "not-found"
  | "forbidden"
  | "closed"
  | "exceeds-outstanding"
  | "kasbon-forbidden"
  | "split-invalid"
  | "store-closed";

export type ReduceResult =
  | { ok: true; closed: boolean }
  | {
      ok: false;
      reason: "not-found" | "forbidden" | "closed" | "exceeds-outstanding" | "store-closed";
    };

export type SettleResult =
  | { ok: true; saleId: string | null; invoiceNo: string | null; closed: boolean }
  | { ok: false; reason: SettleReason }
  | { ok: false; reason: "sale-failed"; sale: CheckoutFailure };

/** Rolls a pickup back with a business result. */
class TakeAbort extends Error {
  constructor(readonly result: Extract<TakeResult, { ok: false }>) {
    super(result.reason);
  }
}

/** Rolls a settlement back from inside the sale transaction with a business reason. */
class SettleAbort extends Error {
  constructor(readonly reason: SettleReason) {
    super(reason);
  }
}

/**
 * Who records what (FR-CSG-01, ADR-0024): `consignment:pickup` records
 * goods taken out and `consignment:return` goods brought back, for any
 * salesperson; a salesperson with `consignment:sell` records only what they
 * sold themselves, and the Owner may do it for anyone.
 */
function canSellFor(session: Session, salespersonId: string): boolean {
  return (
    session.role.isSystem ||
    (salespersonId === session.user.id && session.permissions.has("consignment:sell"))
  );
}

/** Pickup and return staff see every salesperson; salespeople see their own (FR-CSG-05). */
function seesEveryone(session: Session): boolean {
  return (
    session.permissions.has("consignment:pickup") || session.permissions.has("consignment:return")
  );
}

/**
 * Records goods a salesperson takes out (FR-CSG-02). Each call is one dated
 * pickup kept in the history; it joins the salesperson's open consignment
 * or opens one. Stock leaves the shelf now through `CONSIGNMENT_OUT`
 * movements, under the same stock rules as a sale (FR-STK-03/04). A retry
 * with the same idempotency key returns the first result.
 */
export async function takeGoods(
  session: Session,
  input: TakeGoodsInput,
  context: RequestContext,
  now = new Date(),
): Promise<TakeResult> {
  assertPermission(session, "page:consignments");
  if (!session.permissions.has("consignment:pickup")) return { ok: false, reason: "forbidden" };
  const earlier = await findBatchByKey(db, session.user.id, input.idempotencyKey);
  if (earlier) return { ok: true, consignmentId: earlier.consignmentId, replayed: true };
  if (await storeClosedFor(session, now)) return { ok: false, reason: "store-closed" };
  if (!(await listSalespeople()).some((person) => person.id === input.salespersonId)) {
    return { ok: false, reason: "invalid-salesperson" };
  }
  const operations = await readSetting("operations");

  try {
    return await db.transaction(async (tx) => {
      const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
      const variants = new Map(
        (await findTakeableVariants(tx, variantIds)).map((row) => [row.id, row]),
      );
      if (variantIds.some((id) => !variants.get(id)?.sellable)) {
        throw new TakeAbort({ ok: false, reason: "invalid-items" });
      }

      await insertOpenConsignment(tx, input.salespersonId);
      const consignment = await lockOpenConsignment(tx, input.salespersonId);
      if (!consignment) throw new Error("Open consignment expected");

      const batchId = await insertBatch(tx, {
        consignmentId: consignment.id,
        kind: "TAKE",
        actorId: session.user.id,
        idempotencyKey: input.idempotencyKey,
        note: input.note === "" ? null : input.note,
      });
      const quantities = new Map<string, number>();
      for (const line of input.lines) {
        quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.qty);
      }
      const sorted = [...quantities.keys()].sort();
      await insertItems(
        tx,
        sorted.map((variantId) => {
          const variant = variants.get(variantId);
          return {
            batchId,
            consignmentId: consignment.id,
            variantId,
            kind: "TAKE" as const,
            qty: quantities.get(variantId) ?? 0,
            nameSnapshot: variant?.productName ?? "",
            variantSnapshot: variantSnapshotOf(
              variant?.attributes,
              variant?.size ?? null,
              variant?.isDefect,
            ),
            unitPrice: variant?.price ?? 0,
          };
        }),
      );
      for (const variantId of sorted) {
        if (!variants.get(variantId)?.trackStock) continue;
        const moved = await recordStockMovement(
          tx,
          {
            variantId,
            type: "CONSIGNMENT_OUT",
            qtyDelta: -(quantities.get(variantId) ?? 0),
            actorId: session.user.id,
            reference: { type: "consignment", id: consignment.id },
          },
          { allowNegative: operations.allowNegativeStock },
        );
        if (!moved.ok) {
          throw new TakeAbort(
            moved.reason === "insufficient-stock"
              ? { ok: false, reason: "insufficient-stock", variantId, available: moved.available }
              : { ok: false, reason: "invalid-items" },
          );
        }
      }
      await touchConsignment(tx, consignment.id, now);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "consignment.taken",
          entity: "consignment",
          entityId: consignment.id,
          diff: {
            salespersonId: input.salespersonId,
            items: sorted.map((variantId) => ({ variantId, qty: quantities.get(variantId) })),
          },
        },
        context,
      );
      return { ok: true as const, consignmentId: consignment.id, replayed: false };
    });
  } catch (error) {
    if (error instanceof TakeAbort) return error.result;
    if (uniqueViolationConstraint(error) === "consignment_batches_actor_idempotency_key") {
      const concurrent = await findBatchByKey(db, session.user.id, input.idempotencyKey);
      if (concurrent) return { ok: true, consignmentId: concurrent.consignmentId, replayed: true };
    }
    throw error;
  }
}

interface OutstandingChange {
  kind: "SETTLE" | "REDUCE";
  idempotencyKey: string;
  note: string;
  lines: readonly { variantId: string; sold: number; returned: number; reduced: number }[];
}

/**
 * Writes a settlement or correction batch inside the caller's transaction:
 * checks the quantities against what is still outstanding under a row
 * lock, stores the sold, returned and reduced lines, puts returned and
 * reduced goods back on the shelf with `CONSIGNMENT_RETURN` and closes the
 * consignment once nothing is left (FR-CSG-03/07).
 */
async function recordSettlement(
  tx: Executor,
  session: Session,
  consignmentId: string,
  input: OutstandingChange,
  sale: { id: string; invoiceNo: string } | null,
  context: RequestContext,
  now: Date,
): Promise<boolean> {
  const locked = await lockConsignment(tx, consignmentId);
  if (!locked) throw new SettleAbort("not-found");
  if (locked.status !== "OPEN") throw new SettleAbort("closed");
  const balances = new Map(
    (await consignmentBalances(tx, consignmentId)).map((row) => [row.variantId, row]),
  );
  const requested = new Map<string, { sold: number; returned: number; reduced: number }>();
  for (const line of input.lines) {
    const current = requested.get(line.variantId) ?? { sold: 0, returned: 0, reduced: 0 };
    requested.set(line.variantId, {
      sold: current.sold + line.sold,
      returned: current.returned + line.returned,
      reduced: current.reduced + line.reduced,
    });
  }
  const settled = (line: { sold: number; returned: number; reduced: number }) =>
    line.sold + line.returned + line.reduced;
  for (const [variantId, line] of requested) {
    const balance = balances.get(variantId);
    if (!balance || settled(line) > balance.outstanding) {
      throw new SettleAbort("exceeds-outstanding");
    }
  }

  const batchId = await insertBatch(tx, {
    consignmentId,
    kind: input.kind,
    actorId: session.user.id,
    saleId: sale?.id ?? null,
    idempotencyKey: input.idempotencyKey,
    note: input.note === "" ? null : input.note,
  });
  const sorted = [...requested.keys()].sort();
  await insertItems(
    tx,
    sorted.flatMap((variantId) => {
      const line = requested.get(variantId);
      const balance = balances.get(variantId);
      if (!line || !balance) return [];
      const base = {
        batchId,
        consignmentId,
        variantId,
        nameSnapshot: balance.name,
        variantSnapshot: balance.variantName,
      };
      return [
        ...(line.sold > 0
          ? [{ ...base, kind: "SOLD" as const, qty: line.sold, unitPrice: balance.price }]
          : []),
        ...(line.returned > 0
          ? [
              {
                ...base,
                kind: "RETURN" as const,
                qty: line.returned,
                unitPrice: balance.takenPrice,
              },
            ]
          : []),
        ...(line.reduced > 0
          ? [
              {
                ...base,
                kind: "REDUCE" as const,
                qty: line.reduced,
                unitPrice: balance.takenPrice,
              },
            ]
          : []),
      ];
    }),
  );
  for (const variantId of sorted) {
    const line = requested.get(variantId);
    const returned = line ? line.returned + line.reduced : 0;
    if (returned === 0 || !balances.get(variantId)?.trackStock) continue;
    const moved = await recordStockMovement(
      tx,
      {
        variantId,
        type: "CONSIGNMENT_RETURN",
        qtyDelta: returned,
        actorId: session.user.id,
        reference: { type: "consignment", id: consignmentId },
      },
      { allowNegative: true },
    );
    if (!moved.ok) throw new SettleAbort("exceeds-outstanding");
  }

  const left = [...balances.values()].reduce((sum, balance) => {
    const line = requested.get(balance.variantId);
    return sum + balance.outstanding - (line ? settled(line) : 0);
  }, 0);
  if (left === 0) await closeConsignment(tx, consignmentId, now);
  else await touchConsignment(tx, consignmentId, now);

  await recordAudit(
    tx,
    {
      actorId: session.user.id,
      action: input.kind === "REDUCE" ? "consignment.reduced" : "consignment.settled",
      entity: "consignment",
      entityId: consignmentId,
      diff: {
        invoiceNo: sale?.invoiceNo ?? null,
        items: sorted.map((variantId) => ({ variantId, ...requested.get(variantId) })),
        closed: left === 0,
      },
    },
    context,
  );
  return left === 0;
}

function settlementOf(input: SettleGoodsInput): OutstandingChange {
  return {
    kind: "SETTLE",
    idempotencyKey: input.idempotencyKey,
    note: input.note,
    lines: input.lines.map((line) => ({ ...line, reduced: 0 })),
  };
}

/**
 * Settles what a salesperson sold and brings back (FR-CSG-03/04). The sold
 * part needs the salesperson's own `consignment:sell`, the returned part
 * `consignment:return` (ADR-0024). Sold goods become one sale for the named buyer, paid in full by cash or
 * transfer or put on store credit, in the actor's open shift like any POS
 * sale; it writes no second stock movement because the goods already left
 * at pickup. Returned goods go back on the shelf. Everything, sale
 * included, happens in one transaction, so an over-settlement rolls the
 * sale back. Idempotent through the sale's or the batch's key.
 */
export async function settleGoods(
  session: Session,
  consignmentId: string,
  input: SettleGoodsInput,
  context: RequestContext,
  now = new Date(),
): Promise<SettleResult> {
  assertPermission(session, "page:consignments");
  const consignment = await findConsignment(consignmentId);
  if (!consignment) return { ok: false, reason: "not-found" };
  const soldLines = input.lines.filter((line) => line.sold > 0);
  if (soldLines.length > 0 && !canSellFor(session, consignment.salespersonId)) {
    return { ok: false, reason: "forbidden" };
  }
  if (
    input.lines.some((line) => line.returned > 0) &&
    !session.permissions.has("consignment:return")
  ) {
    return { ok: false, reason: "forbidden" };
  }
  if (await storeClosedFor(session, now)) return { ok: false, reason: "store-closed" };

  let closed = false;
  try {
    if (soldLines.length === 0) {
      const earlier = await findBatchByKey(db, session.user.id, input.idempotencyKey);
      if (earlier) return { ok: true, saleId: null, invoiceNo: null, closed: false };
      closed = await db.transaction((tx) =>
        recordSettlement(tx, session, consignmentId, settlementOf(input), null, context, now),
      );
      return { ok: true, saleId: null, invoiceNo: null, closed };
    }

    const { payment, customer } = input;
    if (!customer) return { ok: false, reason: "not-found" };
    if (payment.method === "KASBON" && !session.permissions.has("kasbon:create")) {
      return { ok: false, reason: "kasbon-forbidden" };
    }
    const balances = new Map(
      (await consignmentBalances(db, consignmentId)).map((row) => [row.variantId, row]),
    );
    const tax = await readSetting("tax");
    const lines = soldLines.map((line) => ({ variantId: line.variantId, qty: line.sold }));
    const grandTotal = calculateSale(
      lines.map((line) => ({
        unitPrice: balances.get(line.variantId)?.price ?? 0,
        qty: line.qty,
        discount: null,
      })),
      tax,
    ).grandTotal;
    if (payment.method === "SPLIT" && payment.cash >= grandTotal) {
      return { ok: false, reason: "split-invalid" };
    }
    const saleInput: CheckoutInput = {
      idempotencyKey: input.idempotencyKey,
      lines,
      customer,
      payments:
        payment.method === "KASBON" || grandTotal === 0
          ? []
          : payment.method === "SPLIT"
            ? [
                { method: "CASH", amount: payment.cash },
                payment.rest.method === "QRIS"
                  ? {
                      method: "QRIS",
                      amount: grandTotal - payment.cash,
                      sourceBank: payment.rest.sourceBank,
                    }
                  : {
                      method: "TRANSFER",
                      amount: grandTotal - payment.cash,
                      bankAccountId: payment.rest.bankAccountId,
                    },
              ]
            : payment.method === "CASH"
              ? [{ method: "CASH", amount: grandTotal }]
              : payment.method === "QRIS"
                ? [{ method: "QRIS", amount: grandTotal, sourceBank: payment.sourceBank }]
                : [
                    {
                      method: "TRANSFER",
                      amount: grandTotal,
                      bankAccountId: payment.bankAccountId,
                    },
                  ],
      ...(payment.method === "KASBON" && grandTotal > 0
        ? { kasbon: { note: payment.note, dueDate: payment.dueDate } }
        : {}),
    };
    const result = await checkout(session, saleInput, context, now, {
      consignmentId,
      onSale: async (tx, sale) => {
        closed = await recordSettlement(
          tx,
          session,
          consignmentId,
          settlementOf(input),
          sale,
          context,
          now,
        );
      },
    });
    if (!result.ok) return { ok: false, reason: "sale-failed", sale: result };
    return { ok: true, saleId: result.saleId, invoiceNo: result.invoiceNo, closed };
  } catch (error) {
    if (error instanceof SettleAbort) return { ok: false, reason: error.reason };
    if (uniqueViolationConstraint(error) === "consignment_batches_actor_idempotency_key") {
      return { ok: true, saleId: null, invoiceNo: null, closed: false };
    }
    throw error;
  }
}

/**
 * Takes goods off a salesperson's load that were entered by mistake
 * (FR-CSG-07, ADR-0042). Only pickup staff may do it, up to what is still
 * outstanding; the goods go back on the shelf and the correction stays in
 * the history as its own batch. A retry with the same key does nothing.
 */
export async function reduceGoods(
  session: Session,
  consignmentId: string,
  input: ReduceGoodsInput,
  context: RequestContext,
  now = new Date(),
): Promise<ReduceResult> {
  assertPermission(session, "page:consignments");
  if (!session.permissions.has("consignment:pickup")) return { ok: false, reason: "forbidden" };
  const consignment = await findConsignment(consignmentId);
  if (!consignment) return { ok: false, reason: "not-found" };
  const earlier = await findBatchByKey(db, session.user.id, input.idempotencyKey);
  if (earlier) return { ok: true, closed: false };
  if (await storeClosedFor(session, now)) return { ok: false, reason: "store-closed" };

  try {
    const closed = await db.transaction((tx) =>
      recordSettlement(
        tx,
        session,
        consignmentId,
        {
          kind: "REDUCE",
          idempotencyKey: input.idempotencyKey,
          note: input.note,
          lines: input.lines.map((line) => ({
            variantId: line.variantId,
            sold: 0,
            returned: 0,
            reduced: line.qty,
          })),
        },
        null,
        context,
        now,
      ),
    );
    return { ok: true, closed };
  } catch (error) {
    if (error instanceof SettleAbort) {
      return {
        ok: false,
        reason:
          error.reason === "not-found" || error.reason === "closed"
            ? error.reason
            : "exceeds-outstanding",
      };
    }
    if (uniqueViolationConstraint(error) === "consignment_batches_actor_idempotency_key") {
      return { ok: true, closed: false };
    }
    throw error;
  }
}

/** Open or recently closed consignments; salespeople only see their own (FR-CSG-05). */
export async function getConsignments(session: Session, status: "OPEN" | "CLOSED") {
  assertPermission(session, "page:consignments");
  return queryConsignments({
    status,
    salespersonId: seesEveryone(session) ? null : session.user.id,
    limit: status === "OPEN" ? 200 : 50,
  });
}

/** One consignment with balances and dated history, if the viewer may see it. */
export async function getConsignment(session: Session, id: string) {
  assertPermission(session, "page:consignments");
  const consignment = await findConsignment(id);
  if (!consignment) return undefined;
  if (consignment.salespersonId !== session.user.id && !seesEveryone(session)) return undefined;
  const [balances, batches] = await Promise.all([consignmentBalances(db, id), listBatches(id)]);
  return { ...consignment, balances, batches };
}

/** Who the viewer may record a pickup for: every salesperson with `consignment:pickup`, else nobody. */
export async function getSalespeopleFor(session: Session) {
  assertPermission(session, "page:consignments");
  return session.permissions.has("consignment:pickup") ? listSalespeople() : [];
}
