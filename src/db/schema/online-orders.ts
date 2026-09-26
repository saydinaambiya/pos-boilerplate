import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./access";
import { productVariants } from "./catalog";
import { id, timestamps, timestamptz } from "./columns";
import { marketplaces } from "./settings";

const money = () => bigint({ mode: "number" });

/** Online order states (PRD §4.2). */
export const onlineOrderStatuses = [
  "PROCESSING",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "COMPLAINT",
  "RETURN_REQUESTED",
  "RETURNED",
] as const;
export const onlineOrderStatus = pgEnum("online_order_status", onlineOrderStatuses);

/** How a complaint was settled (FR-ONL-06). */
export const complaintResolutions = ["REFUND", "RESEND", "REJECTED"] as const;
export const complaintResolution = pgEnum("complaint_resolution", complaintResolutions);

/** Condition of a returned line (FR-ONL-05, BR-19). */
export const returnConditions = ["GOOD", "DAMAGED"] as const;
export const returnCondition = pgEnum("return_condition", returnConditions);

/**
 * Marketplace orders entered by hand (FR-ONL-01..06). Stock leaves when the
 * order is saved (BR-05); the order code is unique per marketplace.
 */
export const onlineOrders = pgTable(
  "online_orders",
  {
    id: id(),
    marketplaceId: uuid()
      .notNull()
      .references(() => marketplaces.id, { onDelete: "restrict" }),
    orderCode: text().notNull(),
    status: onlineOrderStatus().notNull().default("PROCESSING"),
    itemsTotal: money().notNull(),
    shippingFee: money().notNull().default(0),
    note: text(),
    complaintNote: text(),
    resolution: complaintResolution(),
    statusChangedAt: timestamptz().notNull().defaultNow(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamptz(),
    archiveBatchId: uuid(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("online_orders_marketplace_code_key").on(
      table.marketplaceId,
      sql`upper(${table.orderCode})`,
    ),
    index("online_orders_status_changed_at_idx").on(table.status, table.statusChangedAt),
    index("online_orders_created_at_idx").on(table.createdAt),
    check("online_orders_shipping_fee_non_negative", sql`${table.shippingFee} >= 0`),
  ],
);

/** Order lines with names and price frozen at entry time. */
export const onlineOrderItems = pgTable(
  "online_order_items",
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => onlineOrders.id, { onDelete: "restrict" }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    nameSnapshot: text().notNull(),
    variantSnapshot: text(),
    qty: integer().notNull(),
    unitPrice: money().notNull(),
    unitCost: money().notNull().default(0),
    lineTotal: money().notNull(),
    returnCondition: returnCondition(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamptz(),
    archiveBatchId: uuid(),
    ...timestamps,
  },
  (table) => [
    index("online_order_items_order_id_idx").on(table.orderId, table.sortOrder),
    index("online_order_items_variant_id_idx").on(table.variantId),
    check("online_order_items_qty_positive", sql`${table.qty} > 0`),
  ],
);

/** Every status change with time and actor (FR-ONL-03). */
export const onlineOrderEvents = pgTable(
  "online_order_events",
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => onlineOrders.id, { onDelete: "restrict" }),
    fromStatus: onlineOrderStatus(),
    toStatus: onlineOrderStatus().notNull(),
    note: text(),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamptz(),
    archiveBatchId: uuid(),
    ...timestamps,
  },
  (table) => [index("online_order_events_order_id_idx").on(table.orderId, table.createdAt)],
);
