import "server-only";

import { sql } from "drizzle-orm";

import { products, productVariants } from "@/db/schema";

import { PRODUCT_SIZES, ROLL_USAGE_CM } from "./sizes";

/** Roll centimetres a piece row uses (FR-ROL-03). */
const usageCm = sql`CASE ${productVariants.size} ${sql.join(
  PRODUCT_SIZES.map((size) => sql`WHEN ${size} THEN ${ROLL_USAGE_CM[size]}::integer`),
  sql` `,
)} END`;

/**
 * Effective unit price of a variant (FR-VAR-02, FR-ROL-02/05): its
 * override, else on a roll product the size price of a piece (the defect
 * price for a defect piece, falling back to the normal one while none is
 * set), else the product price, which on a roll product is per meter.
 */
export const variantPriceSql =
  sql<number>`coalesce(${productVariants.priceOverride}, CASE WHEN ${productVariants.isDefect} THEN (${products.defectSizePrices} ->> ${productVariants.size})::bigint END, (${products.sizePrices} ->> ${productVariants.size})::bigint, ${products.price})`.mapWith(
    Number,
  );

/**
 * Effective unit cost (FR-PRD-02, FR-ROL-02): a roll product's cost is per
 * meter, so a piece costs that share of the roll it uses.
 */
export const variantCostSql =
  sql<number>`coalesce(${productVariants.costOverride}, CASE WHEN ${products.isRoll} AND ${productVariants.parentId} IS NOT NULL THEN round(${products.cost} * ${usageCm} / 100.0)::bigint ELSE ${products.cost} END)`.mapWith(
    Number,
  );

/** True for the roll row of a colour, whose stock is centimetres (ADR-0023). */
export const isRollRowSql = sql<boolean>`(${products.isRoll} AND ${productVariants.parentId} IS NULL)`;
