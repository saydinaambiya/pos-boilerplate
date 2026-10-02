import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";

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

import { brandOrder, brandPage, brandWindow, productOrder } from "@/features/catalog/brand-page";
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

const levelColumns = {
  variantId: productVariants.id,
  productId: products.id,
  productName: products.name,
  brandId: products.brandId,
  brandName: brands.name,
  motif: products.motif,
  thickness: products.thickness,
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

/** Stock columns of `product_variants` or an alias of it. */
interface VariantTable {
  stockQty: AnyPgColumn;
  minStock: AnyPgColumn;
  parentId: AnyPgColumn;
  isDefect: AnyPgColumn;
}

/** At or below the minimum; a piece only once a minimum is set (ADR-0023). */
const lowStock = (table: VariantTable) =>
  sql`(${table.stockQty} <= ${table.minStock} AND (${table.parentId} IS NULL OR ${table.minStock} > 0))`;

const isLow = lowStock(productVariants);

/** The low, defect and minimum filters, applied to one stock row (FR-STK-07/09, FR-ROL-05). */
function rowConditions(table: VariantTable, filters: StockFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.low) conditions.push(lowStock(table));
  if (filters.defect) conditions.push(eq(table.isDefect, true));
  if (filters.minimum) conditions.push(gt(table.minStock, 0));
  return conditions;
}

const piece = alias(productVariants, "piece");

/**
 * One page of stock groups: a roll or a plain variant of an active,
 * stock-tracked product. A page holds ten brands (unbranded last) with all
 * their groups, by thickness when asked, product name and colour order
 * (FR-STK-08, ADR-0041). The search matches the product, brand, motif,
 * colour or SKU; a group is listed when it or one of its pieces passes
 * the other filters.
 */
export async function queryStockGroups(filters: StockFilters) {
  const conditions: SQL[] = [
    eq(products.trackStock, true),
    eq(products.isActive, true),
    eq(productVariants.isActive, true),
    isNull(productVariants.parentId),
  ];
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    const match = or(
      like(sql`lower(${products.name})`, pattern),
      like(sql`lower(${brands.name})`, pattern),
      like(sql`lower(${products.motif})`, pattern),
      like(sql`lower(${productVariants.sku})`, pattern),
      like(sql`lower(${productVariants.attributes} -> 'color' ->> 'name')`, pattern),
    );
    if (match) conditions.push(match);
  }
  if (filters.thickness !== undefined) conditions.push(eq(products.thickness, filters.thickness));
  const own = rowConditions(productVariants, filters);
  if (own.length > 0) {
    const matchingPiece = db
      .select({ id: piece.id })
      .from(piece)
      .where(
        and(
          eq(piece.parentId, productVariants.id),
          eq(piece.isActive, true),
          ...rowConditions(piece, filters),
        ),
      );
    const match = or(and(...own), exists(matchingPiece));
    if (match) conditions.push(match);
  }
  const window = brandWindow(filters.page);
  const page = brandPage(
    await db
      .select({ brandId: products.brandId })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(and(...conditions))
      .groupBy(products.brandId, brands.name)
      .orderBy(...brandOrder)
      .limit(window.limit)
      .offset(window.offset),
  );
  if (page.empty) return { rows: [], hasNextPage: false };
  const rows = await db
    .select(levelColumns)
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(...conditions, page.condition))
    .orderBy(
      ...brandOrder,
      ...productOrder(filters.sort),
      asc(productVariants.sortOrder),
      asc(productVariants.id),
    );
  return { rows, hasNextPage: page.hasNextPage };
}

/** Active pieces of the given rolls that pass the stock filters, in size order (ADR-0023). */
export async function queryStockPieces(rollIds: readonly string[], filters: StockFilters) {
  if (rollIds.length === 0) return [];
  return db
    .select(levelColumns)
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(
      and(
        inArray(productVariants.parentId, [...rollIds]),
        eq(productVariants.isActive, true),
        ...rowConditions(productVariants, filters),
      ),
    )
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
}

/** Sets a variant's minimum stock (FR-STK-09). */
export async function updateMinStock(executor: Executor, variantId: string, minStock: number) {
  await executor.update(productVariants).set({ minStock }).where(eq(productVariants.id, variantId));
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

export async function findVariantStock(variantId: string, executor: Executor = db) {
  const [row] = await executor
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
