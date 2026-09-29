import "server-only";

import { db, type Executor } from "@/db/client";
import { uniqueViolationConstraint } from "@/db/errors";
import { onlineOrderStatuses } from "@/db/schema/online-orders";
import { variantSnapshotOf } from "@/features/catalog/schemas";
import { recordStockMovement } from "@/features/stock/service";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import {
  countOrdersByStatus,
  findActiveMarketplace,
  findOrderableVariants,
  findOrderDetail,
  findOrderItems,
  insertOrder,
  insertOrderEvent,
  insertOrderItems,
  listActiveMarketplaces,
  lockOrder,
  queryOrders,
  setReturnCondition,
  updateOrderStatus,
} from "./repository";
import type { ChangeStatusInput, CreateOnlineOrderInput } from "./schemas";
import {
  canTransition,
  isHeld,
  nextStatuses,
  type OnlineOrderStatus,
  transitionNeeds,
} from "./transitions";

export const ONLINE_ORDER_PAGE_SIZE = 30;

export type CreateOrderResult =
  | { ok: true; id: string }
  | { ok: false; reason: "invalid-marketplace" | "invalid-items" | "code-taken" }
  | { ok: false; reason: "insufficient-stock"; variantId: string; available: number };

export type ChangeStatusResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not-found"
        | "stale"
        | "invalid-transition"
        | "complaint-note-required"
        | "resolution-required"
        | "return-conditions-required";
    };

class OrderAbort extends Error {
  constructor(readonly result: Exclude<CreateOrderResult, { ok: true }>) {
    super(result.reason);
  }
}

/**
 * Saves a marketplace order and takes its stock at once (FR-ONL-01/02,
 * BR-05). Each line's price is the marketplace price typed by staff; the
 * store price at entry is kept beside it and audited, so odd
 * prices can be traced (FR-ONL-08, ADR-0025). Variants are locked in id
 * order. A duplicate code for the same marketplace is refused.
 */
export async function createOnlineOrder(
  session: Session,
  input: CreateOnlineOrderInput,
  context: RequestContext,
): Promise<CreateOrderResult> {
  assertPermission(session, "page:online-orders");
  const { allowNegativeStock } = await readSetting("operations");
  const orderCode = input.orderCode.trim().toUpperCase();
  try {
    return await db.transaction(async (tx) => {
      const marketplace = await findActiveMarketplace(tx, input.marketplaceId);
      if (!marketplace) throw new OrderAbort({ ok: false, reason: "invalid-marketplace" });

      const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
      const variants = new Map(
        (await findOrderableVariants(tx, variantIds)).map((row) => [row.id, row]),
      );
      if (variantIds.some((id) => !variants.get(id)?.sellable)) {
        throw new OrderAbort({ ok: false, reason: "invalid-items" });
      }
      const lines = input.lines.map((line, index) => {
        const variant = variants.get(line.variantId);
        const { unitPrice } = line;
        return {
          variantId: line.variantId,
          nameSnapshot: variant?.productName ?? "",
          variantSnapshot: variantSnapshotOf(
            variant?.attributes,
            variant?.size ?? null,
            variant?.isDefect,
          ),
          qty: line.qty,
          unitPrice,
          storePrice: variant?.price ?? null,
          unitCost: variant?.cost ?? 0,
          lineTotal: unitPrice * line.qty,
          sortOrder: index,
        };
      });
      const itemsTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

      const orderId = await insertOrder(tx, {
        marketplaceId: marketplace.id,
        orderCode,
        itemsTotal,
        shippingFee: input.shippingFee,
        note: input.note === "" ? null : input.note,
        createdBy: session.user.id,
      });
      await insertOrderItems(
        tx,
        lines.map((line) => ({ ...line, orderId })),
      );
      await insertOrderEvent(tx, {
        orderId,
        fromStatus: null,
        toStatus: "PROCESSING",
        actorId: session.user.id,
      });

      const quantities = new Map<string, number>();
      for (const line of input.lines) {
        quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.qty);
      }
      for (const variantId of [...quantities.keys()].sort()) {
        if (!variants.get(variantId)?.trackStock) continue;
        const moved = await recordStockMovement(
          tx,
          {
            variantId,
            type: "ONLINE_SALE",
            qtyDelta: -(quantities.get(variantId) ?? 0),
            actorId: session.user.id,
            reference: { type: "online-order", id: orderId },
          },
          { allowNegative: allowNegativeStock },
        );
        if (!moved.ok) {
          throw new OrderAbort(
            moved.reason === "insufficient-stock"
              ? { ok: false, reason: "insufficient-stock", variantId, available: moved.available }
              : { ok: false, reason: "invalid-items" },
          );
        }
      }

      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "online-order.created",
          entity: "online-order",
          entityId: orderId,
          diff: {
            marketplace: marketplace.name,
            orderCode,
            itemsTotal,
            shippingFee: input.shippingFee,
            items: lines.map((line) => ({
              variantId: line.variantId,
              qty: line.qty,
              unitPrice: line.unitPrice,
              storePrice: line.storePrice,
            })),
          },
        },
        context,
      );
      return { ok: true, id: orderId } as const;
    });
  } catch (error) {
    if (error instanceof OrderAbort) return error.result;
    if (uniqueViolationConstraint(error) === "online_orders_marketplace_code_key") {
      return { ok: false, reason: "code-taken" };
    }
    throw error;
  }
}

/** Puts stock back: `GOOD` returns it, `DAMAGED` returns and writes it off (BR-19). */
async function restock(
  tx: Executor,
  actorId: string,
  orderId: string,
  item: { variantId: string; qty: number },
  condition: "GOOD" | "DAMAGED" | "CANCELLED",
) {
  const reference = { type: "online-order", id: orderId };
  await recordStockMovement(
    tx,
    {
      variantId: item.variantId,
      type: "RETURN",
      qtyDelta: item.qty,
      actorId,
      reason: condition === "CANCELLED" ? "cancelled" : "returned",
      reference,
    },
    { allowNegative: true },
  );
  if (condition === "DAMAGED") {
    await recordStockMovement(
      tx,
      {
        variantId: item.variantId,
        type: "WRITE_OFF",
        qtyDelta: -item.qty,
        actorId,
        reason: "damaged return",
        reference,
      },
      { allowNegative: true },
    );
  }
}

/**
 * Moves an order along PRD §4.2 and records who did it when (FR-ONL-03).
 * Cancelling puts the stock back; `RETURNED` records each line's condition
 * and restocks or writes it off (FR-ONL-05). Refuses a change based on a
 * status the order no longer has.
 */
export async function changeOnlineOrderStatus(
  session: Session,
  orderId: string,
  input: ChangeStatusInput,
  context: RequestContext,
): Promise<ChangeStatusResult> {
  assertPermission(session, "order.online:update-status");
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) return { ok: false, reason: "not-found" } as const;
    if (order.status !== input.from) return { ok: false, reason: "stale" } as const;
    if (!canTransition(order.status, input.to)) {
      return { ok: false, reason: "invalid-transition" } as const;
    }
    const needs = transitionNeeds(order.status, input.to);
    if (needs.complaintNote && input.complaintNote === "") {
      return { ok: false, reason: "complaint-note-required" } as const;
    }
    if (needs.resolution && !input.resolution) {
      return { ok: false, reason: "resolution-required" } as const;
    }

    const items = await findOrderItems(tx, order.id);
    if (needs.returnConditions) {
      const conditions = new Map(input.returns.map((entry) => [entry.itemId, entry.condition]));
      if (items.some((item) => !conditions.has(item.id))) {
        return { ok: false, reason: "return-conditions-required" } as const;
      }
      for (const item of items) {
        const condition = conditions.get(item.id) ?? "GOOD";
        await setReturnCondition(tx, item.id, condition);
        if (item.trackStock) await restock(tx, session.user.id, order.id, item, condition);
      }
    }
    if (input.to === "CANCELLED") {
      for (const item of items) {
        if (item.trackStock) await restock(tx, session.user.id, order.id, item, "CANCELLED");
      }
    }

    await updateOrderStatus(tx, order.id, {
      status: input.to,
      ...(needs.complaintNote ? { complaintNote: input.complaintNote } : {}),
      ...(needs.resolution ? { resolution: input.resolution } : {}),
    });
    await insertOrderEvent(tx, {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: input.to,
      note: input.note === "" ? null : input.note,
      actorId: session.user.id,
    });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "online-order.status-changed",
        entity: "online-order",
        entityId: order.id,
        diff: {
          orderCode: order.orderCode,
          from: order.status,
          to: input.to,
          ...(needs.resolution ? { resolution: input.resolution } : {}),
          ...(needs.returnConditions ? { returns: input.returns } : {}),
        },
      },
      context,
    );
    return { ok: true } as const;
  });
}

/** Status counts for the chips; every status is present (FR-ONL-04). */
async function statusCounts(search: string, includeArchived = false) {
  const rows = await countOrdersByStatus(search, includeArchived);
  const counts = Object.fromEntries(onlineOrderStatuses.map((status) => [status, 0])) as Record<
    OnlineOrderStatus,
    number
  >;
  for (const row of rows) counts[row.status] = row.count;
  return counts;
}

/** The order board: chips per status, cards, code search and held markers (FR-ONL-04/07). */
export async function listOnlineOrders(
  session: Session,
  options: {
    status: OnlineOrderStatus | undefined;
    search: string;
    page: number;
    includeArchived?: boolean;
  },
  now = new Date(),
) {
  assertPermission(session, "page:online-orders");
  const [rows, counts, operations] = await Promise.all([
    queryOrders(
      {
        status: options.status,
        search: options.search,
        includeArchived: options.includeArchived ?? false,
      },
      options.page,
      ONLINE_ORDER_PAGE_SIZE,
    ),
    statusCounts(options.search, options.includeArchived),
    readSetting("operations"),
  ]);
  return {
    orders: rows.slice(0, ONLINE_ORDER_PAGE_SIZE).map((row) => ({
      ...row,
      held: isHeld(row.status, row.statusChangedAt, operations.heldOrderHours, now),
    })),
    hasNextPage: rows.length > ONLINE_ORDER_PAGE_SIZE,
    counts,
  };
}

/** Counts for the dashboard chips (FR-DSH-01); null without access. */
export async function getOnlineOrderCounts(session: Session) {
  if (!session.permissions.has("page:online-orders")) return null;
  return statusCounts("");
}

/** One order with its history and the changes the viewer may make. */
export async function getOnlineOrder(session: Session, orderId: string, now = new Date()) {
  assertPermission(session, "page:online-orders");
  const [order, operations] = await Promise.all([
    findOrderDetail(orderId),
    readSetting("operations"),
  ]);
  if (!order) return undefined;
  return {
    ...order,
    held: isHeld(order.status, order.statusChangedAt, operations.heldOrderHours, now),
    next: session.permissions.has("order.online:update-status") ? nextStatuses[order.status] : [],
  };
}

/** Marketplaces to choose from when entering an order. */
export async function getOrderMarketplaces(session: Session) {
  assertPermission(session, "page:online-orders");
  return listActiveMarketplaces();
}
