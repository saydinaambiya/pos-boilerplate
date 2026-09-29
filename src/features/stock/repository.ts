import "server-only";

import { and, asc, desc, eq, gte, isNull, like, lt, or, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { containsPattern } from "@/db/like";
import {
  brands,
  productVariants,
  products,
  stockMovements,
  type stockMovementTypes,
  users,
} from "@/db/schema";

import { isRollRowSql } from "@/features/catalog/pricing-sql";

import type { StockFilters } from "./schemas";

export type StockMovementType = (typeof stockMovementTypes)[number];

/** Locks the variant row for the rest of the transaction (FR-STK-03). */
export async function lockVariant(executor: Executor, variantId: string) {
  const [row] = await executor
    .select({
      id: productVariants.id,
      stockQty: productVariants.stockQty,
      trackStock: products.trackStock,
      isRoll: isRollRowSql,
      isPiece: sql<boolean>`(${products.isRoll} AND ${productVariants.parentId} IS NOT NULL)`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId))
    .for("update", { of: productVariants });
  return row;
}

/**
 * Conditional update: a decrease only succeeds while enough stock remains,
 * unless negative stock is allowed (FR-STK-03/04). Returns the new quantity,
 * or `undefined` when the condition failed.
 */
export async function applyStockDelta(
  executor: Executor,
  variantId: string,
  delta: number,
  allowNegative: boolean,
): Promise<number | undefined> {
  const guard =
    allowNegative || delta >= 0 ? sql`true` : sql`${productVariants.stockQty} + ${delta} >= 0`;
  const [row] = await executor
    .update(productVariants)
    .set({ stockQty: sql`${productVariants.stockQty} + ${delta}` })
    .where(and(eq(productVariants.id, variantId), guard))
    .returning({ stockQty: productVariants.stockQty });
  return row?.stockQty;
}

export async function insertMovement(
  executor: Executor,
  values: typeof stockMovements.$inferInsert,
): Promise<string> {
  const [row] = await executor
    .insert(stockMovements)
    .values(values)
    .returning({ id: stockMovements.id });
  if (!row) throw new Error("Stock movement insert returned no row");
  return row.id;
}

/** Display order of a piece's roll, so pieces list under their colour. */
const parentSort = sql`(SELECT "roll"."sort_order" FROM "product_variants" AS "roll" WHERE "roll"."id" = ${productVariants.parentId})`;

const levelColumns = {
  variantId: productVariants.id,
  productId: products.id,
  productName: products.name,
  brandName: brands.name,
  unit: products.unit,
  sku: productVariants.sku,
  colorName: sql<string | null>`${productVariants.attributes} -> 'color' ->> 'name'`,
  size: productVariants.size,
  isDefect: productVariants.isDefect,
  parentId: productVariants.parentId,
  isRoll: isRollRowSql,
  stockQty: productVariants.stockQty,
  minStock: productVariants.minStock,
  trackStock: products.trackStock,
  isActive: products.isActive,
};

/** At or below the minimum; a piece only once a minimum is set (ADR-0023). */
const isLow = sql`(${productVariants.stockQty} <= ${productVariants.minStock} AND (${productVariants.parentId} IS NULL OR ${productVariants.minStock} > 0))`;

/**
 * Stock levels of active variants of stock-tracked products: rolls and
 * their pieces, each colour's roll first (ADR-0023).
 */
export async function queryStockLevels(filters: StockFilters, pageSize: number) {
  const conditions: SQL[] = [
    eq(products.trackStock, true),
    eq(products.isActive, true),
    eq(productVariants.isActive, true),
  ];
  if (filters.low) conditions.push(isLow);
  if (filters.defect) conditions.push(eq(productVariants.isDefect, true));
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    const match = or(
      like(sql`lower(${products.name})`, pattern),
      like(sql`lower(${productVariants.sku})`, pattern),
      like(sql`lower(${productVariants.attributes} -> 'color' ->> 'name')`, pattern),
    );
    if (match) conditions.push(match);
  }
  return db
    .select(levelColumns)
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(...conditions))
    .orderBy(
      asc(products.name),
      asc(sql`coalesce(${parentSort}, ${productVariants.sortOrder})`),
      asc(sql`${productVariants.parentId} IS NOT NULL`),
      asc(productVariants.sortOrder),
      asc(productVariants.id),
    )
    .limit(pageSize + 1)
    .offset((filters.page - 1) * pageSize);
}

/** Variants at or below their minimum, most depleted first (FR-STK-07). */
export async function queryLowStock(limit: number) {
  return db
    .select(levelColumns)
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(
      and(
        eq(products.trackStock, true),
        eq(products.isActive, true),
        eq(productVariants.isActive, true),
        isLow,
      ),
    )
    .orderBy(
      asc(sql`${productVariants.stockQty} - ${productVariants.minStock}`),
      asc(products.name),
    )
    .limit(limit);
}

export async function findVariantStock(variantId: string) {
  const [row] = await db
    .select(levelColumns)
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(eq(productVariants.id, variantId))
    .limit(1);
  return row;
}

export interface MovementQuery {
  variantId: string;
  type?: StockMovementType;
  from?: Date;
  until?: Date;
  before?: string;
  includeArchived?: boolean;
  limit: number;
}

/** One page of a variant's movements, newest first, with the actor's name. */
export async function queryMovements(query: MovementQuery) {
  const conditions: SQL[] = [eq(stockMovements.variantId, query.variantId)];
  if (query.type) conditions.push(eq(stockMovements.type, query.type));
  if (query.from) conditions.push(gte(stockMovements.createdAt, query.from));
  if (query.until) conditions.push(lt(stockMovements.createdAt, query.until));
  if (query.before) conditions.push(lt(stockMovements.id, query.before));
  if (!query.includeArchived) conditions.push(isNull(stockMovements.archivedAt));
  return db
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      type: stockMovements.type,
      qtyDelta: stockMovements.qtyDelta,
      stockAfter: stockMovements.stockAfter,
      reason: stockMovements.reason,
      referenceType: stockMovements.referenceType,
      referenceId: stockMovements.referenceId,
      actorName: users.name,
    })
    .from(stockMovements)
    .leftJoin(users, eq(users.id, stockMovements.actorId))
    .where(and(...conditions))
    .orderBy(desc(stockMovements.id))
    .limit(query.limit);
}
