import "server-only";

import { and, asc, desc, eq, inArray, isNull, like, or, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { containsPattern } from "@/db/like";
import { brands, products, productVariants, stockMovements, users } from "@/db/schema";

const rollColumns = {
  id: productVariants.id,
  productId: products.id,
  productName: products.name,
  brandId: products.brandId,
  brandName: brands.name,
  motif: products.motif,
  sku: productVariants.sku,
  colorName: sql<string | null>`${productVariants.attributes} -> 'color' ->> 'name'`,
  attributes: productVariants.attributes,
  stockQty: productVariants.stockQty,
};

const activeRoll = [
  eq(products.isRoll, true),
  eq(products.isActive, true),
  isNull(productVariants.parentId),
  eq(productVariants.isActive, true),
];

/**
 * Active rolls by brand (unbranded last), product name and colour order,
 * so the list groups per brand (FR-ROL-03, ADR-0040).
 */
export async function queryRolls(filters: { q: string }, limit: number) {
  const conditions: SQL[] = [...activeRoll];
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    const match = or(
      like(sql`lower(${products.name})`, pattern),
      like(sql`lower(${products.motif})`, pattern),
      like(sql`lower(${brands.name})`, pattern),
      like(sql`lower(${productVariants.sku})`, pattern),
      like(sql`lower(${productVariants.attributes} -> 'color' ->> 'name')`, pattern),
    );
    if (match) conditions.push(match);
  }
  return db
    .select(rollColumns)
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(...conditions))
    .orderBy(
      sql`lower(${brands.name}) ASC NULLS LAST`,
      asc(products.brandId),
      asc(products.name),
      asc(products.id),
      asc(productVariants.sortOrder),
      asc(productVariants.id),
    )
    .limit(limit);
}

export async function findRoll(executor: Executor, id: string) {
  const [row] = await executor
    .select(rollColumns)
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(eq(productVariants.id, id), ...activeRoll))
    .limit(1);
  return row;
}

/** A roll's pieces by size (FR-ROL-01). */
export async function listRollPieces(executor: Executor, rollId: string) {
  return executor
    .select({
      id: productVariants.id,
      size: productVariants.size,
      isDefect: productVariants.isDefect,
      stockQty: productVariants.stockQty,
    })
    .from(productVariants)
    .where(eq(productVariants.parentId, rollId))
    .orderBy(asc(productVariants.sortOrder));
}

/** Active pieces of the given rolls by size, for the roll list (FR-ROL-03). */
export async function listPiecesOfRolls(rollIds: readonly string[]) {
  if (rollIds.length === 0) return [];
  return db
    .select({
      id: productVariants.id,
      parentId: productVariants.parentId,
      size: productVariants.size,
      isDefect: productVariants.isDefect,
      stockQty: productVariants.stockQty,
    })
    .from(productVariants)
    .where(and(inArray(productVariants.parentId, [...rollIds]), eq(productVariants.isActive, true)))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
}

/** Whether a cut with this key was already recorded (FR-ROL-03 idempotency). */
export async function cutExists(executor: Executor, key: string): Promise<boolean> {
  const [row] = await executor
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(and(eq(stockMovements.referenceType, "roll-cut"), eq(stockMovements.referenceId, key)))
    .limit(1);
  return row !== undefined;
}

/**
 * Latest cuts, newest first: the roll side of each `CUT` (negative
 * centimetres) with the pieces it produced, grouped by the cut's reference.
 */
export async function queryRecentCuts(limit: number) {
  const cuts = await db
    .select({
      id: stockMovements.referenceId,
      createdAt: stockMovements.createdAt,
      usedCm: sql<number>`-${stockMovements.qtyDelta}`.mapWith(Number),
      stockAfter: stockMovements.stockAfter,
      actorName: users.name,
      productName: products.name,
      colorName: sql<string | null>`${productVariants.attributes} -> 'color' ->> 'name'`,
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(users, eq(users.id, stockMovements.actorId))
    .where(
      and(
        eq(stockMovements.type, "CUT"),
        eq(stockMovements.referenceType, "roll-cut"),
        sql`${stockMovements.qtyDelta} < 0`,
      ),
    )
    .orderBy(desc(stockMovements.id))
    .limit(limit);
  const ids = cuts.flatMap((cut) => (cut.id ? [cut.id] : []));
  const pieces =
    ids.length === 0
      ? []
      : await db
          .select({
            cutId: stockMovements.referenceId,
            size: productVariants.size,
            isDefect: productVariants.isDefect,
            qty: stockMovements.qtyDelta,
          })
          .from(stockMovements)
          .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
          .where(
            and(
              eq(stockMovements.referenceType, "roll-cut"),
              inArray(stockMovements.referenceId, ids),
              sql`${stockMovements.qtyDelta} > 0`,
            ),
          )
          .orderBy(asc(productVariants.sortOrder));
  return cuts.map((cut) => {
    const made = pieces.filter((piece) => piece.cutId === cut.id);
    return {
      ...cut,
      defect: made.some((piece) => piece.isDefect),
      pieces: made.map(({ size, qty }) => ({ size, qty })),
    };
  });
}
