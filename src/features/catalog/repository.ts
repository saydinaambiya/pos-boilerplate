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

/** Stock totals over a product's active variants (one row per product). */
const variantTotals = db
  .select({
    productId: productVariants.productId,
    totalStock: sql<number>`sum(${productVariants.stockQty})`.as("total_stock"),
    lowCount:
      sql<number>`count(*) filter (where ${productVariants.stockQty} <= ${productVariants.minStock})`.as(
        "low_count",
      ),
    variantCount: count().as("variant_count"),
  })
  .from(productVariants)
  .where(eq(productVariants.isActive, true))
  .groupBy(productVariants.productId)
  .as("variant_totals");

const productColumns = {
  id: products.id,
  name: products.name,
  categoryId: products.categoryId,
  categoryName: categories.name,
  price: products.price,
  cost: products.cost,
  unit: products.unit,
  trackStock: products.trackStock,
  hasVariants: products.hasVariants,
  isActive: products.isActive,
  variantId: productVariants.id,
  sku: productVariants.sku,
  minStock: productVariants.minStock,
  stockQty: sql<number>`coalesce(${variantTotals.totalStock}, 0)`.mapWith(Number),
  lowStockVariants: sql<number>`coalesce(${variantTotals.lowCount}, 0)`.mapWith(Number),
  variantCount: sql<number>`coalesce(${variantTotals.variantCount}, 0)`.mapWith(Number),
};

function productQuery() {
  return db
    .select(productColumns)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(
      productVariants,
      and(eq(productVariants.productId, products.id), eq(productVariants.isDefault, true)),
    )
    .leftJoin(variantTotals, eq(variantTotals.productId, products.id));
}

/**
 * One page of products with their default variant and stock totals across
 * active variants. Search matches product name, SKU and colour name via the
 * trigram indexes on `lower(...)` (FR-PRD-04, FR-VAR-07).
 */
export async function queryProducts(filters: ProductFilters, pageSize: number) {
  const conditions: SQL[] = [];
  if (filters.status !== "all") conditions.push(eq(products.isActive, filters.status === "active"));
  if (filters.category) conditions.push(eq(products.categoryId, filters.category));
  if (filters.q) {
    const pattern = containsPattern(filters.q);
    const variantMatch = db
      .select({ one: sql`1` })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, products.id),
          or(
            like(sql`lower(${productVariants.sku})`, pattern),
            like(sql`lower(${productVariants.attributes} -> 'color' ->> 'name')`, pattern),
          ),
        ),
      );
    const match = or(like(sql`lower(${products.name})`, pattern), exists(variantMatch));
    if (match) conditions.push(match);
  }

  return productQuery()
    .where(and(...conditions))
    .orderBy(asc(products.name), asc(products.id))
    .limit(pageSize + 1)
    .offset((filters.page - 1) * pageSize);
}

export async function findProduct(id: string) {
  const [row] = await productQuery().where(eq(products.id, id)).limit(1);
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

/** Updates a product; the default variant too unless colour variants own those fields. */
export async function updateProductWithDefaultVariant(
  executor: Executor,
  id: string,
  product: ProductRowValues,
  variant: { sku: string; minStock: number } | null,
): Promise<void> {
  await executor.update(products).set(product).where(eq(products.id, id));
  if (!variant) return;
  await executor
    .update(productVariants)
    .set(variant)
    .where(and(eq(productVariants.productId, id), eq(productVariants.isDefault, true)));
}

export async function setProductActive(executor: Executor, id: string, isActive: boolean) {
  await executor.update(products).set({ isActive }).where(eq(products.id, id));
}

const variantColumns = {
  id: productVariants.id,
  productId: productVariants.productId,
  sku: productVariants.sku,
  attributes: productVariants.attributes,
  priceOverride: productVariants.priceOverride,
  costOverride: productVariants.costOverride,
  stockQty: productVariants.stockQty,
  minStock: productVariants.minStock,
  sortOrder: productVariants.sortOrder,
  isDefault: productVariants.isDefault,
  isActive: productVariants.isActive,
};

/** Colour variants of a product in display order; the retired hidden default is excluded. */
export async function listColorVariants(executor: Executor, productId: string) {
  return executor
    .select(variantColumns)
    .from(productVariants)
    .where(
      and(eq(productVariants.productId, productId), sql`${productVariants.attributes} ? 'color'`),
    )
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
}

export async function findVariant(variantId: string) {
  const [row] = await db
    .select({
      ...variantColumns,
      productName: products.name,
      productPrice: products.price,
      productCost: products.cost,
      productActive: products.isActive,
      hasVariants: products.hasVariants,
      trackStock: products.trackStock,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId))
    .limit(1);
  return row;
}

export async function findDefaultVariant(executor: Executor, productId: string) {
  const [row] = await executor
    .select(variantColumns)
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.isDefault, true)))
    .limit(1);
  return row;
}

export async function insertVariant(
  executor: Executor,
  values: typeof productVariants.$inferInsert,
): Promise<string> {
  const [row] = await executor
    .insert(productVariants)
    .values(values)
    .returning({ id: productVariants.id });
  if (!row) throw new Error("Variant insert returned no row");
  return row.id;
}

export async function updateVariantRow(
  executor: Executor,
  id: string,
  values: Partial<typeof productVariants.$inferInsert>,
): Promise<void> {
  await executor.update(productVariants).set(values).where(eq(productVariants.id, id));
}

export async function markProductHasVariants(executor: Executor, productId: string): Promise<void> {
  await executor.update(products).set({ hasVariants: true }).where(eq(products.id, productId));
}

/**
 * Sellable items for the POS grid: active products with their active
 * variants and effective prices, grouped client-side (FR-POS-01, FR-VAR-04).
 * `limit` bounds the preload; bigger catalogues switch to server search
 * (NFR-PERF-07).
 */
export async function queryPosCatalog(options: { limit: number; search?: string }) {
  const conditions: SQL[] = [eq(products.isActive, true), eq(productVariants.isActive, true)];
  if (options.search) {
    const pattern = containsPattern(options.search);
    const match = or(
      like(sql`lower(${products.name})`, pattern),
      like(sql`lower(${productVariants.sku})`, pattern),
      like(sql`lower(${productVariants.attributes} -> 'color' ->> 'name')`, pattern),
    );
    if (match) conditions.push(match);
  }
  return db
    .select({
      productId: products.id,
      name: products.name,
      categoryId: products.categoryId,
      unit: products.unit,
      trackStock: products.trackStock,
      hasVariants: products.hasVariants,
      variantId: productVariants.id,
      sku: productVariants.sku,
      attributes: productVariants.attributes,
      price: sql<number>`coalesce(${productVariants.priceOverride}, ${products.price})`.mapWith(
        Number,
      ),
      stockQty: productVariants.stockQty,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(and(...conditions))
    .orderBy(asc(products.name), asc(productVariants.sortOrder), asc(productVariants.id))
    .limit(options.limit);
}
