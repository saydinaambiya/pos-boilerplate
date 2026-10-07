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
import { sales } from "./sales";

const money = () => bigint({ mode: "number" });

export const consignmentStatuses = ["OPEN", "CLOSED"] as const;
export const consignmentStatus = pgEnum("consignment_status", consignmentStatuses);

/**
 * Goods a salesperson carries (PRD §3.16, ADR-0019). One running record per
 * salesperson while anything is outstanding; it closes once every item is
 * sold or returned, and the next pickup opens a new one.
 */
export const consignments = pgTable(
  "consignments",
  {
    id: id(),
    salespersonId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: consignmentStatus().notNull().default("OPEN"),
    closedAt: timestamptz(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consignments_one_open_per_salesperson_key")
      .on(table.salespersonId)
      .where(sql`${table.status} = 'OPEN'`),
    index("consignments_status_updated_at_idx").on(table.status, table.updatedAt),
  ],
);

export const consignmentBatchKinds = ["TAKE", "SETTLE", "REDUCE"] as const;
export const consignmentBatchKind = pgEnum("consignment_batch_kind", consignmentBatchKinds);

/**
 * One recorded visit: a pickup (`TAKE`), a settlement of sold and
 * returned goods (`SETTLE`) or a correction of a pickup entered too high
 * (`REDUCE`, FR-CSG-07). Batches are never edited, so every day's
 * pickups stay in the history (FR-CSG-02). `sale_id` is the sale created for
 * the sold part, if any.
 */
export const consignmentBatches = pgTable(
  "consignment_batches",
  {
    id: id(),
    consignmentId: uuid()
      .notNull()
      .references(() => consignments.id, { onDelete: "restrict" }),
    kind: consignmentBatchKind().notNull(),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    saleId: uuid().references(() => sales.id, { onDelete: "restrict" }),
    idempotencyKey: text().notNull(),
    note: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consignment_batches_actor_idempotency_key").on(
      table.actorId,
      table.idempotencyKey,
    ),
    index("consignment_batches_consignment_id_idx").on(table.consignmentId, table.createdAt),
  ],
);

export const consignmentItemKinds = ["TAKE", "SOLD", "RETURN", "REDUCE"] as const;
export const consignmentItemKind = pgEnum("consignment_item_kind", consignmentItemKinds);

/**
 * Quantities per variant in a batch. Outstanding goods of a consignment =
 * Σ TAKE − Σ SOLD − Σ RETURN − Σ REDUCE per variant (FR-CSG-03/07). Names and the price at
 * pickup are frozen for the history.
 */
export const consignmentItems = pgTable(
  "consignment_items",
  {
    id: id(),
    batchId: uuid()
      .notNull()
      .references(() => consignmentBatches.id, { onDelete: "restrict" }),
    consignmentId: uuid()
      .notNull()
      .references(() => consignments.id, { onDelete: "restrict" }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    kind: consignmentItemKind().notNull(),
    qty: integer().notNull(),
    nameSnapshot: text().notNull(),
    variantSnapshot: text(),
    unitPrice: money().notNull(),
    ...timestamps,
  },
  (table) => [
    index("consignment_items_consignment_id_idx").on(table.consignmentId, table.variantId),
    index("consignment_items_batch_id_idx").on(table.batchId),
    check("consignment_items_qty_positive", sql`${table.qty} > 0`),
  ],
);
