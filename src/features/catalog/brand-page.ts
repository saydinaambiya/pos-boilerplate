import "server-only";

import { asc, inArray, isNull, or, type SQL, sql } from "drizzle-orm";

import { brands, products } from "@/db/schema";

import type { ListSort } from "./schemas";

/** Brands per page on the product, stock and Cut Rolls lists (ADR-0041). */
export const BRAND_PAGE_SIZE = 10;

/** Brand order of the grouped lists, unbranded last (ADR-0038). */
export const brandOrder: SQL[] = [sql`lower(${brands.name}) ASC NULLS LAST`, asc(products.brandId)];

/** Product order inside a brand: by thickness when asked, then name (FR-PRD-04, ADR-0041). */
export function productOrder(sort: ListSort): SQL[] {
  const byName = [asc(products.name), asc(products.id)];
  if (sort === "thickness-asc") return [sql`${products.thickness} ASC NULLS LAST`, ...byName];
  if (sort === "thickness-desc") return [sql`${products.thickness} DESC NULLS LAST`, ...byName];
  return byName;
}

/** Offset and limit of one page of brands, with one extra to tell whether more follow. */
export function brandWindow(page: number) {
  return { limit: BRAND_PAGE_SIZE + 1, offset: (page - 1) * BRAND_PAGE_SIZE };
}

/**
 * The brands of one page from a brand query run with {@link brandWindow},
 * and the condition that keeps a row query to them; `null` is unbranded.
 */
export function brandPage(rows: readonly { brandId: string | null }[]) {
  const listed = rows.slice(0, BRAND_PAGE_SIZE).map((row) => row.brandId);
  const ids = listed.filter((brandId) => brandId !== null);
  return {
    empty: listed.length === 0,
    hasNextPage: rows.length > BRAND_PAGE_SIZE,
    condition: or(
      ids.length > 0 ? inArray(products.brandId, ids) : undefined,
      listed.includes(null) ? isNull(products.brandId) : undefined,
    ),
  };
}
