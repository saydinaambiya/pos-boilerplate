import "server-only";

import { and, asc, desc, eq, inArray, like, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import {
  marketplaces,
  onlineOrderEvents,
  onlineOrderItems,
  onlineOrders,
  products,
  productVariants,
  users,
} from "@/db/schema";

import type { OnlineOrderStatus } from "./transitions";

export async function findActiveMarketplace(executor: Executor, id: string) {
  const [row] = await executor
    .select({ id: marketplaces.id, name: marketplaces.name })
    .from(marketplaces)
    .where(and(eq(marketplaces.id, id), eq(marketplaces.isActive, true)))
    .limit(1);
  return row;
}

export async function listActiveMarketplaces() {
  return db
    .select({ id: marketplaces.id, name: marketplaces.name })
    .from(marketplaces)
    .where(eq(marketplaces.isActive, true))
    .orderBy(asc(marketplaces.name));
}

/** Variants on the order with price and names for snapshots. */
export async function findOrderableVariants(executor: Executor, variantIds: readonly string[]) {
  return executor
    .select({
      id: productVariants.id,
      productName: products.name,
      trackStock: products.trackStock,
      attributes: productVariants.attributes,
      price: sql<number>`coalesce(${productVariants.priceOverride}, ${products.price})`.mapWith(
        Number,
      ),
      cost: sql<number>`coalesce(${productVariants.costOverride}, ${products.cost})`.mapWith(
        Number,
      ),
      sellable: sql<boolean>`${products.isActive} AND ${productVariants.isActive}`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, [...variantIds]));
}

export async function insertOrder(
  executor: Executor,
  values: typeof onlineOrders.$inferInsert,
): Promise<string> {
  const [row] = await executor
    .insert(onlineOrders)
    .values(values)
    .returning({ id: onlineOrders.id });
  if (!row) throw new Error("Online order insert returned no row");
  return row.id;
}

export async function insertOrderItems(
  executor: Executor,
  values: (typeof onlineOrderItems.$inferInsert)[],
) {
  await executor.insert(onlineOrderItems).values(values);
}

export async function insertOrderEvent(
  executor: Executor,
  values: typeof onlineOrderEvents.$inferInsert,
) {
  await executor.insert(onlineOrderEvents).values(values);
}

/** Locks an order for a status change so concurrent changes run one at a time. */
export async function lockOrder(executor: Executor, orderId: string) {
  const [row] = await executor
    .select({ id: onlineOrders.id, status: onlineOrders.status, orderCode: onlineOrders.orderCode })
    .from(onlineOrders)
    .where(eq(onlineOrders.id, orderId))
    .for("update");
  return row;
}

export async function findOrderItems(executor: Executor, orderId: string) {
  return executor
    .select({
      id: onlineOrderItems.id,
      variantId: onlineOrderItems.variantId,
      qty: onlineOrderItems.qty,
      trackStock: products.trackStock,
    })
    .from(onlineOrderItems)
    .innerJoin(productVariants, eq(productVariants.id, onlineOrderItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(onlineOrderItems.orderId, orderId))
    .orderBy(asc(onlineOrderItems.sortOrder));
}

export async function setReturnCondition(
  executor: Executor,
  itemId: string,
  condition: "GOOD" | "DAMAGED",
) {
  await executor
    .update(onlineOrderItems)
    .set({ returnCondition: condition })
    .where(eq(onlineOrderItems.id, itemId));
}

export async function updateOrderStatus(
  executor: Executor,
  orderId: string,
  values: {
    status: OnlineOrderStatus;
    complaintNote?: string;
    resolution?: "REFUND" | "RESEND" | "REJECTED" | null;
  },
) {
  await executor
    .update(onlineOrders)
    .set({ ...values, statusChangedAt: new Date() })
    .where(eq(onlineOrders.id, orderId));
}

const boardColumns = {
  id: onlineOrders.id,
  orderCode: onlineOrders.orderCode,
  marketplaceName: marketplaces.name,
  status: onlineOrders.status,
  itemsTotal: onlineOrders.itemsTotal,
  shippingFee: onlineOrders.shippingFee,
  statusChangedAt: onlineOrders.statusChangedAt,
  createdAt: onlineOrders.createdAt,
  itemCount: sql<number>`(
    select coalesce(sum(${onlineOrderItems.qty}), 0) from ${onlineOrderItems}
    where ${onlineOrderItems.orderId} = ${onlineOrders.id}
  )`.mapWith(Number),
  firstItem: sql<string | null>`(
    select ${onlineOrderItems.nameSnapshot} from ${onlineOrderItems}
    where ${onlineOrderItems.orderId} = ${onlineOrders.id}
    order by ${onlineOrderItems.sortOrder} limit 1
  )`,
};

function codeCondition(term: string): SQL | undefined {
  if (term === "") return undefined;
  const pattern = `%${term.toUpperCase().replace(/[\\%_]/g, "\\$&")}%`;
  return like(sql`upper(${onlineOrders.orderCode})`, pattern);
}

/** Orders on the board, oldest status change first so waiting orders surface (FR-ONL-04). */
export async function queryOrders(
  filters: { status: OnlineOrderStatus | undefined; search: string },
  page: number,
  pageSize: number,
) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(onlineOrders.status, filters.status));
  const code = codeCondition(filters.search);
  if (code) conditions.push(code);
  return db
    .select(boardColumns)
    .from(onlineOrders)
    .innerJoin(marketplaces, eq(marketplaces.id, onlineOrders.marketplaceId))
    .where(and(...conditions))
    .orderBy(
      filters.status ? asc(onlineOrders.statusChangedAt) : desc(onlineOrders.createdAt),
      asc(onlineOrders.id),
    )
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
}

/** Order count per status for the chips (FR-ONL-04, FR-DSH-01). */
export async function countOrdersByStatus(search: string) {
  const code = codeCondition(search);
  return db
    .select({ status: onlineOrders.status, count: sql<number>`count(*)`.mapWith(Number) })
    .from(onlineOrders)
    .where(code)
    .groupBy(onlineOrders.status);
}

/** One order with lines, marketplace and status history (FR-ONL-03). */
export async function findOrderDetail(orderId: string) {
  const [order] = await db
    .select({
      ...boardColumns,
      marketplaceId: onlineOrders.marketplaceId,
      note: onlineOrders.note,
      complaintNote: onlineOrders.complaintNote,
      resolution: onlineOrders.resolution,
      createdByName: users.name,
    })
    .from(onlineOrders)
    .innerJoin(marketplaces, eq(marketplaces.id, onlineOrders.marketplaceId))
    .innerJoin(users, eq(users.id, onlineOrders.createdBy))
    .where(eq(onlineOrders.id, orderId))
    .limit(1);
  if (!order) return undefined;

  const [items, events] = await Promise.all([
    db
      .select({
        id: onlineOrderItems.id,
        nameSnapshot: onlineOrderItems.nameSnapshot,
        variantSnapshot: onlineOrderItems.variantSnapshot,
        qty: onlineOrderItems.qty,
        unitPrice: onlineOrderItems.unitPrice,
        lineTotal: onlineOrderItems.lineTotal,
        returnCondition: onlineOrderItems.returnCondition,
      })
      .from(onlineOrderItems)
      .where(eq(onlineOrderItems.orderId, orderId))
      .orderBy(asc(onlineOrderItems.sortOrder)),
    db
      .select({
        id: onlineOrderEvents.id,
        fromStatus: onlineOrderEvents.fromStatus,
        toStatus: onlineOrderEvents.toStatus,
        note: onlineOrderEvents.note,
        actorName: users.name,
        createdAt: onlineOrderEvents.createdAt,
      })
      .from(onlineOrderEvents)
      .innerJoin(users, eq(users.id, onlineOrderEvents.actorId))
      .where(eq(onlineOrderEvents.orderId, orderId))
      .orderBy(desc(onlineOrderEvents.createdAt), desc(onlineOrderEvents.id)),
  ]);
  return { ...order, items, events };
}
