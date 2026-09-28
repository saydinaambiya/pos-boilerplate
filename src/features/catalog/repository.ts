import "server-only";

import { and, asc, count, eq, exists, like, or, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { containsPattern } from "@/db/like";
import { brands, products, productVariants } from "@/db/schema";

import type { BrandInput, ProductFilters } from "./schemas";

/** Brands by name with their product counts (FR-CAT-02). */
export async function listBrands() {
  const productCounts = db
    .select({ brandId: products.brandId, total: count().as("product_total") })
    .from(products)
    .groupBy(products.brandId)
    .as("product_counts");
  return db
    .select({
      id: brands.id,
      name: brands.name,
      productCount: sql<number>`coalesce(${productCounts.total}, 0)`.mapWith(Number),
    })
    .from(brands)
    .leftJoin(productCounts, eq(productCounts.brandId, brands.id))
    .orderBy(asc(sql`lower(${brands.name})`));
}

export async function findBrand(id: string) {
  const [row] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  return row;
}

export async function insertBrand(executor: Executor, values: BrandInput) {
  const [row] = await executor.insert(brands).values(values).returning({ id: brands.id });
  if (!row) throw new Error("Brand insert returned no row");
  return row.id;
}

export async function updateBrandRow(executor: Executor, id: string, values: BrandInput) {
  await executor.update(brands).set(values).where(eq(brands.id, id));
}

export async function deleteBrandRow(executor: Executor, id: string) {
  await executor.delete(brands).where(eq(brands.id, id));
}

export async function countProductsOfBrand(brandId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(products)
    .where(eq(products.brandId, brandId));
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
  brandId: products.brandId,
  brandName: brands.name,
  motif: products.motif,
  size: products.size,
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
    .leftJoin(brands, eq(brands.id, products.brandId))
    .innerJoin(
      productVariants,
      and(eq(productVariants.productId, products.id), eq(productVariants.isDefault, true)),
    )
    .leftJoin(variantTotals, eq(variantTotals.productId, products.id));
}

/**
 * One page of products with their default variant and stock totals across
 * active variants. Search matches product name, SKU and colour name via the
 * trigram indexes on `lower(...)`, plus brand and motif (FR-PRD-04,
 * FR-PRD-06, FR-VAR-07).
 */
export async function queryProducts(filters: ProductFilters, pageSize: number) {
  const conditions: SQL[] = [];
  if (filters.status !== "all") conditions.push(eq(products.isActive, filters.status === "active"));
  if (filters.brand) conditions.push(eq(products.brandId, filters.brand));
  if (filters.size) conditions.push(eq(products.size, filters.size));
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
    const match = or(
      like(sql`lower(${products.name})`, pattern),
      like(sql`lower(${products.motif})`, pattern),
      like(sql`lower(${brands.name})`, pattern),
      exists(variantMatch),
    );
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
  brandId: string | null;
  motif: string | null;
  size: string | null;
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
 * Search also matches brand and motif (FR-PRD-06).
 * `limit` bounds the preload; bigger catalogues switch to server search
 * (NFR-PERF-07).
 */
export async function queryPosCatalog(options: { limit: number; search?: string }) {
  const conditions: SQL[] = [eq(products.isActive, true), eq(productVariants.isActive, true)];
  if (options.search) {
    const pattern = containsPattern(options.search);
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
    .select({
      productId: products.id,
      name: products.name,
      brandId: products.brandId,
      brandName: brands.name,
      motif: products.motif,
      size: products.size,
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
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(...conditions))
    .orderBy(asc(products.name), asc(productVariants.sortOrder), asc(productVariants.id))
    .limit(options.limit);
}
