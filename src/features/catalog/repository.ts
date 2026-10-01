import "server-only";

import { and, asc, count, eq, exists, inArray, isNull, like, or, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { containsPattern } from "@/db/like";
import { brands, products, productVariants } from "@/db/schema";

import { variantPriceSql } from "./pricing-sql";
import type { BrandInput, ProductFilters, SizePrices } from "./schemas";
import { PRODUCT_SIZES } from "./sizes";

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

/**
 * Stock totals over a product's active variants (one row per product).
 * Colour rows (a roll's centimetres, or plain pieces) and cut pieces are
 * summed apart, since their units differ (ADR-0023). A piece only counts
 * as low when it has a minimum set, so uncut sizes do not flag every roll.
 * Colour names come in colour order for the product list (FR-PRD-04).
 */
const variantTotals = db
  .select({
    productId: productVariants.productId,
    totalStock:
      sql<number>`coalesce(sum(${productVariants.stockQty}) filter (where ${productVariants.parentId} is null), 0)`.as(
        "total_stock",
      ),
    pieceStock:
      sql<number>`coalesce(sum(${productVariants.stockQty}) filter (where ${productVariants.parentId} is not null), 0)`.as(
        "piece_stock",
      ),
    lowCount:
      sql<number>`count(*) filter (where ${productVariants.stockQty} <= ${productVariants.minStock} and (${productVariants.parentId} is null or ${productVariants.minStock} > 0))`.as(
        "low_count",
      ),
    variantCount: sql<number>`count(*) filter (where ${productVariants.parentId} is null)`.as(
      "variant_count",
    ),
    colorNames: sql<
      string[]
    >`array_agg(${productVariants.attributes} -> 'color' ->> 'name' order by ${productVariants.sortOrder}, ${productVariants.id}) filter (where ${productVariants.parentId} is null and ${productVariants.attributes} -> 'color' ->> 'name' is not null)`.as(
      "color_names",
    ),
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
  thickness: products.thickness,
  isRoll: products.isRoll,
  sizePrices: products.sizePrices,
  defectSizePrices: products.defectSizePrices,
  price: products.price,
  unit: products.unit,
  trackStock: products.trackStock,
  hasVariants: products.hasVariants,
  isActive: products.isActive,
  variantId: productVariants.id,
  sku: productVariants.sku,
  minStock: productVariants.minStock,
  stockQty: sql<number>`coalesce(${variantTotals.totalStock}, 0)`.mapWith(Number),
  pieceStock: sql<number>`coalesce(${variantTotals.pieceStock}, 0)`.mapWith(Number),
  lowStockVariants: sql<number>`coalesce(${variantTotals.lowCount}, 0)`.mapWith(Number),
  variantCount: sql<number>`coalesce(${variantTotals.variantCount}, 0)`.mapWith(Number),
  colorNames: sql<string[]>`coalesce(${variantTotals.colorNames}, '{}')`,
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
 * active variants, by brand then name so the list groups per brand,
 * unbranded last. Search matches product name, SKU and colour name via the
 * trigram indexes on `lower(...)`, plus brand and motif (FR-PRD-04,
 * FR-PRD-06, FR-VAR-07).
 */
export async function queryProducts(filters: ProductFilters, pageSize: number) {
  const conditions: SQL[] = [];
  if (filters.status !== "all") conditions.push(eq(products.isActive, filters.status === "active"));
  if (filters.brand) conditions.push(eq(products.brandId, filters.brand));
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
    .orderBy(
      sql`lower(${brands.name}) ASC NULLS LAST`,
      asc(products.brandId),
      asc(products.name),
      asc(products.id),
    )
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
  thickness: number | null;
  sizePrices: SizePrices | null;
  defectSizePrices: SizePrices | null;
  price: number;
  unit: string;
  trackStock: boolean;
}

/**
 * SKU of a piece: its roll's SKU plus the size, e.g. `KRP-01-93x47`, and
 * `-D` for a defect piece (ADR-0023, FR-ROL-05).
 */
export function pieceSku(rollSku: string, size: string, isDefect = false): string {
  return `${rollSku}-${size}${isDefect ? "-D" : ""}`;
}

/**
 * One piece row per size under a roll row, copying its colour (FR-ROL-01).
 * Pieces sort in `PRODUCT_SIZES` order.
 */
export async function insertPieces(
  executor: Executor,
  roll: { id: string; productId: string; sku: string; attributes: unknown; isActive?: boolean },
): Promise<void> {
  await executor.insert(productVariants).values(
    PRODUCT_SIZES.map((size, index) => ({
      productId: roll.productId,
      parentId: roll.id,
      size,
      sku: pieceSku(roll.sku, size),
      attributes: roll.attributes,
      sortOrder: index,
      isActive: roll.isActive ?? true,
    })),
  );
}

/**
 * The defect piece of one size under a roll, created on first use with
 * the roll's colour and status; defect pieces list after the normal ones
 * (FR-ROL-05).
 */
export async function ensureDefectPiece(
  executor: Executor,
  roll: { id: string; productId: string; sku: string; attributes: unknown; isActive: boolean },
  size: (typeof PRODUCT_SIZES)[number],
): Promise<string> {
  const [existing] = await executor
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.parentId, roll.id),
        eq(productVariants.size, size),
        eq(productVariants.isDefect, true),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  return insertVariant(executor, {
    productId: roll.productId,
    parentId: roll.id,
    size,
    isDefect: true,
    sku: pieceSku(roll.sku, size, true),
    attributes: roll.attributes,
    sortOrder: PRODUCT_SIZES.length + PRODUCT_SIZES.indexOf(size),
    isActive: roll.isActive,
  });
}

/** Keeps a roll's pieces in step with its SKU, colour and status (ADR-0023). */
export async function syncPieces(
  executor: Executor,
  rollId: string,
  values: { sku?: string; attributes?: unknown; isActive?: boolean },
): Promise<void> {
  const { sku, ...rest } = values;
  await executor
    .update(productVariants)
    .set({
      ...rest,
      ...(sku === undefined
        ? {}
        : {
            sku: sql`${sku} || '-' || ${productVariants.size} || CASE WHEN ${productVariants.isDefect} THEN '-D' ELSE '' END`,
          }),
    })
    .where(eq(productVariants.parentId, rollId));
}

export async function insertProductWithDefaultVariant(
  executor: Executor,
  product: ProductRowValues & { isRoll: boolean; hasVariants?: boolean },
  variant: { sku: string; minStock: number; attributes?: unknown },
): Promise<string> {
  const [row] = await executor.insert(products).values(product).returning({ id: products.id });
  if (!row) throw new Error("Product insert returned no row");
  const [defaultRow] = await executor
    .insert(productVariants)
    .values({ productId: row.id, isDefault: true, ...variant })
    .returning({ id: productVariants.id });
  if (!defaultRow) throw new Error("Variant insert returned no row");
  if (product.isRoll) {
    await insertPieces(executor, {
      id: defaultRow.id,
      productId: row.id,
      sku: variant.sku,
      attributes: variant.attributes ?? {},
    });
  }
  return row.id;
}

/**
 * Updates a product; the default variant too unless colour variants own
 * those fields. On a roll product the default roll's pieces follow its SKU.
 */
export async function updateProductWithDefaultVariant(
  executor: Executor,
  id: string,
  product: ProductRowValues,
  variant: { sku: string; minStock: number } | null,
): Promise<void> {
  await executor.update(products).set(product).where(eq(products.id, id));
  if (!variant) return;
  const [updated] = await executor
    .update(productVariants)
    .set(variant)
    .where(and(eq(productVariants.productId, id), eq(productVariants.isDefault, true)))
    .returning({ id: productVariants.id });
  if (updated) await syncPieces(executor, updated.id, { sku: variant.sku });
}

export async function setProductActive(executor: Executor, id: string, isActive: boolean) {
  await executor.update(products).set({ isActive }).where(eq(products.id, id));
}

const variantColumns = {
  id: productVariants.id,
  productId: productVariants.productId,
  parentId: productVariants.parentId,
  size: productVariants.size,
  isDefect: productVariants.isDefect,
  sku: productVariants.sku,
  attributes: productVariants.attributes,
  priceOverride: productVariants.priceOverride,
  stockQty: productVariants.stockQty,
  minStock: productVariants.minStock,
  sortOrder: productVariants.sortOrder,
  isDefault: productVariants.isDefault,
  isActive: productVariants.isActive,
};

/**
 * Colour variants of a product in display order; the retired hidden
 * default and the pieces cut from a roll are excluded.
 */
export async function listColorVariants(executor: Executor, productId: string) {
  return executor
    .select(variantColumns)
    .from(productVariants)
    .where(
      and(
        eq(productVariants.productId, productId),
        isNull(productVariants.parentId),
        sql`${productVariants.attributes} ? 'color'`,
      ),
    )
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
}

/** Pieces of the given rolls in size order (FR-ROL-01). */
export async function listPieces(executor: Executor, rollIds: readonly string[]) {
  if (rollIds.length === 0) return [];
  return executor
    .select(variantColumns)
    .from(productVariants)
    .where(inArray(productVariants.parentId, [...rollIds]))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.id));
}

export async function findVariant(variantId: string) {
  const [row] = await db
    .select({
      ...variantColumns,
      productName: products.name,
      productPrice: products.price,
      productActive: products.isActive,
      hasVariants: products.hasVariants,
      trackStock: products.trackStock,
      isRoll: products.isRoll,
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
 * On a roll product that is each colour's roll, priced per meter for
 * custom cuts, and its pieces (FR-ROL-04). Search also matches brand and
 * motif (FR-PRD-06).
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
      thickness: products.thickness,
      isRoll: products.isRoll,
      unit: products.unit,
      trackStock: products.trackStock,
      hasVariants: products.hasVariants,
      variantId: productVariants.id,
      parentId: productVariants.parentId,
      size: productVariants.size,
      isDefect: productVariants.isDefect,
      sku: productVariants.sku,
      attributes: productVariants.attributes,
      price: variantPriceSql,
      stockQty: productVariants.stockQty,
    })
    .from(products)
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(...conditions))
    .orderBy(asc(products.name), asc(productVariants.sortOrder), asc(productVariants.id))
    .limit(options.limit);
}
