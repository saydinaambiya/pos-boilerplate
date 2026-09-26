import "server-only";

import { and, asc, count, eq, exists, like, or, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { containsPattern } from "@/db/like";
import { categories, products, productVariants } from "@/db/schema";

import type { CategoryInput, ProductFilters } from "./schemas";

/** Categories in display order with their product counts (one query). */
export async function listCategories() {
  const productCounts = db
    .select({ categoryId: products.categoryId, total: count().as("product_total") })
    .from(products)
    .groupBy(products.categoryId)
    .as("product_counts");
  return db
    .select({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
      productCount: sql<number>`coalesce(${productCounts.total}, 0)`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(productCounts, eq(productCounts.categoryId, categories.id))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function findCategory(id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return row;
}

export async function insertCategory(executor: Executor, values: CategoryInput) {
  const [row] = await executor.insert(categories).values(values).returning({ id: categories.id });
  if (!row) throw new Error("Category insert returned no row");
  return row.id;
}

export async function updateCategoryRow(executor: Executor, id: string, values: CategoryInput) {
  await executor.update(categories).set(values).where(eq(categories.id, id));
}

export async function deleteCategoryRow(executor: Executor, id: string) {
  await executor.delete(categories).where(eq(categories.id, id));
}

export async function countProductsInCategory(categoryId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(products)
    .where(eq(products.categoryId, categoryId));
  return row?.total ?? 0;
}

const productColumns = {
  id: products.id,
  name: products.name,
  categoryId: products.categoryId,
  categoryName: categories.name,
  price: products.price,
  cost: products.cost,
  unit: products.unit,
  trackStock: products.trackStock,
  isActive: products.isActive,
  variantId: productVariants.id,
  sku: productVariants.sku,
  stockQty: productVariants.stockQty,
  minStock: productVariants.minStock,
};

/**
 * One page of products with their default variant. Name and SKU search use
 * the trigram indexes on `lower(...)` (FR-PRD-04, FR-VAR-07).
 */
export async function queryProducts(filters: ProductFilters, pageSize: number) {
  const conditions: SQL[] = [];
  if (filters.status !== "all") conditions.push(eq(products.isActive, filters.status === "active"));
  if (filters.category) conditions.push(eq(products.categoryId, filters.category));
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    const skuMatch = db
      .select({ one: sql`1` })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, products.id),
          like(sql`lower(${productVariants.sku})`, pattern),
        ),
      );
    const nameOrSku = or(like(sql`lower(${products.name})`, pattern), exists(skuMatch));
    if (nameOrSku) conditions.push(nameOrSku);
  }

  return db
    .select(productColumns)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(
      productVariants,
      and(eq(productVariants.productId, products.id), eq(productVariants.isDefault, true)),
    )
    .where(and(...conditions))
    .orderBy(asc(products.name), asc(products.id))
    .limit(pageSize + 1)
    .offset((filters.page - 1) * pageSize);
}

export async function findProduct(id: string) {
  const [row] = await db
    .select(productColumns)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(
      productVariants,
      and(eq(productVariants.productId, products.id), eq(productVariants.isDefault, true)),
    )
    .where(eq(products.id, id))
    .limit(1);
  return row;
}

export interface ProductRowValues {
  name: string;
  categoryId: string;
  price: number;
  cost: number;
  unit: string;
  trackStock: boolean;
}

export async function insertProductWithDefaultVariant(
  executor: Executor,
  product: ProductRowValues,
  variant: { sku: string; minStock: number },
): Promise<string> {
  const [row] = await executor.insert(products).values(product).returning({ id: products.id });
  if (!row) throw new Error("Product insert returned no row");
  await executor.insert(productVariants).values({ productId: row.id, isDefault: true, ...variant });
  return row.id;
}

export async function updateProductWithDefaultVariant(
  executor: Executor,
  id: string,
  product: ProductRowValues,
  variant: { sku: string; minStock: number },
): Promise<void> {
  await executor.update(products).set(product).where(eq(products.id, id));
  await executor
    .update(productVariants)
    .set(variant)
    .where(and(eq(productVariants.productId, id), eq(productVariants.isDefault, true)));
}

export async function setProductActive(executor: Executor, id: string, isActive: boolean) {
  await executor.update(products).set({ isActive }).where(eq(products.id, id));
}
