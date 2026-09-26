import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";

/** Integer rupiah (PRD §5); `number` mode is exact up to 2^53. */
const money = () => bigint({ mode: "number" });

/** Product categories with a display order (FR-CAT-01). */
export const categories = pgTable(
  "categories",
  {
    id: id(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("categories_name_key").on(sql`lower(${table.name})`),
    index("categories_sort_order_idx").on(table.sortOrder, table.name),
  ],
);

/**
 * Products (FR-PRD-01). SKU, stock and minimum stock live on variants; a
 * product without colour variants has one hidden default variant (§3.1.1).
 */
export const products = pgTable(
  "products",
  {
    id: id(),
    name: text().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    price: money().notNull(),
    cost: money().notNull().default(0),
    unit: text().notNull(),
    trackStock: boolean().notNull().default(true),
    hasVariants: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("products_category_id_idx").on(table.categoryId),
    index("products_name_trgm_idx").using("gin", sql`lower(${table.name}) gin_trgm_ops`),
    check("products_price_non_negative", sql`${table.price} >= 0 AND ${table.cost} >= 0`),
  ],
);

/** Sellable unit with its own SKU and stock (§3.1.1, FR-STK-01). */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
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
    uniqueIndex("product_variants_one_default_key")
      .on(table.productId)
      .where(sql`${table.isDefault}`),
    index("product_variants_product_id_idx").on(table.productId, table.sortOrder),
    index("product_variants_sku_trgm_idx").using("gin", sql`lower(${table.sku}) gin_trgm_ops`),
    check("product_variants_min_stock_non_negative", sql`${table.minStock} >= 0`),
  ],
);
