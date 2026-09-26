import { index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { users } from "./access";
import { productVariants } from "./catalog";
import { id, timestamps } from "./columns";

/** Every way stock can change (PRD FR-STK-01). */
export const stockMovementTypes = [
  "IN",
  "SALE",
  "ONLINE_SALE",
  "RETURN",
  "WRITE_OFF",
  "ADJUSTMENT",
  "VOID",
] as const;

export const stockMovementType = pgEnum("stock_movement_type", stockMovementTypes);

/**
 * Append-only stock ledger. `product_variants.stock_qty` is the running
 * total, updated in the same transaction as each row (FR-STK-02);
 * `stock_after` records it for the history view.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    type: stockMovementType().notNull(),
    qtyDelta: integer().notNull(),
    stockAfter: integer().notNull(),
    referenceType: text(),
    referenceId: text(),
    reason: text(),
    actorId: uuid().references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("stock_movements_variant_id_idx").on(table.variantId, table.id),
    index("stock_movements_type_created_at_idx").on(table.type, table.createdAt),
  ],
);
