import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps, timestamptz } from "./columns";

/** Integer rupiah (PRD §5); `number` mode is exact up to 2^53. */
const money = () => bigint({ mode: "number" });

/** Product brands, listed by name (FR-CAT-02). */
export const brands = pgTable(
  "brands",
  {
    id: id(),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("brands_name_key").on(sql`lower(${table.name})`)],
);

/**
 * Products (FR-PRD-01). SKU, stock and minimum stock live on variants; a
 * product without colour variants has one hidden default variant (§3.1.1).
 * Brand, motif and thickness are required for new products only, so older
 * rows may leave them empty (FR-PRD-06).
 *
 * A roll product (`is_roll`, FR-ROL-01, ADR-0023) is bought by the meter and
 * cut into pieces: `price` and `cost` are then per meter, and `size_prices`
 * holds the piece price of every size in `PRODUCT_SIZES`, the same for
 * every colour.
 *
 * A deleted product (`deleted_at`, FR-PRD-03, ADR-0041) is also inactive,
 * so every list and the POS skip it while past sales keep their rows.
 */
export const products = pgTable(
  "products",
  {
    id: id(),
    name: text().notNull(),
    brandId: uuid().references(() => brands.id, { onDelete: "restrict" }),
    motif: text(),
    /** Thickness in mm (FR-PRD-06). */
    thickness: numeric({ precision: 6, scale: 2, mode: "number" }),
    isRoll: boolean().notNull().default(false),
    /** Piece price per size code, validated by Zod (FR-ROL-02). */
    sizePrices: jsonb(),
    /** Price per size of defect pieces, the same for every colour (FR-ROL-05). */
    defectSizePrices: jsonb(),
    price: money().notNull(),
    cost: money().notNull().default(0),
    unit: text().notNull(),
    trackStock: boolean().notNull().default(true),
    hasVariants: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    deletedAt: timestamptz(),
    ...timestamps,
  },
  (table) => [
    index("products_brand_id_idx").on(table.brandId),
    index("products_name_trgm_idx").using("gin", sql`lower(${table.name}) gin_trgm_ops`),
    check("products_price_non_negative", sql`${table.price} >= 0 AND ${table.cost} >= 0`),
  ],
);

/**
 * Sellable unit with its own SKU and stock (§3.1.1, FR-STK-01). On a roll
 * product each colour is a roll row holding its length in cm, and each of
 * its pieces is a child row (`parent_id`, `size`) counted in pcs; pieces
 * copy the roll's colour (FR-ROL-01, ADR-0023).
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    parentId: uuid().references((): AnyPgColumn => productVariants.id, { onDelete: "restrict" }),
    /** Piece size code from `PRODUCT_SIZES`; null on rolls and plain variants. */
    size: text(),
    /** A defect piece: same product and size, flagged and priced apart (FR-ROL-05). */
    isDefect: boolean().notNull().default(false),
    sku: text().notNull(),
    /** Validated by Zod: `{ color?: { name, hex? } }`. */
    attributes: jsonb().notNull().default({}),
    priceOverride: money(),
    costOverride: money(),
    stockQty: integer().notNull().default(0),
    minStock: integer().notNull().default(0),
    sortOrder: integer().notNull().default(0),
    isDefault: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_variants_sku_key").on(sql`lower(${table.sku})`),
    uniqueIndex("product_variants_color_name_key")
      .on(table.productId, sql`lower(${table.attributes} -> 'color' ->> 'name')`)
      .where(sql`${table.parentId} IS NULL`),
    uniqueIndex("product_variants_piece_size_key")
      .on(table.parentId, table.size, table.isDefect)
      .where(sql`${table.parentId} IS NOT NULL`),
    uniqueIndex("product_variants_one_default_key")
      .on(table.productId)
      .where(sql`${table.isDefault}`),
    index("product_variants_product_id_idx").on(table.productId, table.sortOrder),
    index("product_variants_sku_trgm_idx").using("gin", sql`lower(${table.sku}) gin_trgm_ops`),
    check("product_variants_min_stock_non_negative", sql`${table.minStock} >= 0`),
  ],
);
