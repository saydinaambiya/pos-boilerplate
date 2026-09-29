import "server-only";

import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";

import type { PosProduct } from "./pos-types";
import { listBrands, queryPosCatalog } from "./repository";
import { colorOf } from "./schemas";

/** Products preloaded into the terminal; above this the POS searches on the server (NFR-PERF-07). */
export const POS_PRELOAD_PRODUCTS = 1000;
const PRELOAD_ROWS = 5000;
const SEARCH_ROWS = 200;

function groupProducts(rows: Awaited<ReturnType<typeof queryPosCatalog>>): PosProduct[] {
  const byId = new Map<string, PosProduct>();
  for (const row of rows) {
    let product = byId.get(row.productId);
    if (!product) {
      product = {
        id: row.productId,
        name: row.name,
        brandId: row.brandId,
        brandName: row.brandName,
        motif: row.motif,
        thickness: row.thickness,
        isRoll: row.isRoll,
        unit: row.unit,
        trackStock: row.trackStock,
        hasVariants: row.hasVariants,
        variants: [],
      };
      byId.set(row.productId, product);
    }
    const color = colorOf(row.attributes);
    product.variants.push({
      id: row.variantId,
      sku: row.sku,
      colorName: color?.name ?? null,
      hex: color?.hex ?? null,
      price: row.price,
      stockQty: row.stockQty,
      parentId: row.parentId,
      size: row.size,
      isDefect: row.isDefect,
    });
  }
  return [...byId.values()];
}

/**
 * Only whole pieces leave the store with salespeople or marketplace orders;
 * rolls are cut at the POS (FR-ROL-04, ADR-0023).
 */
function withoutRolls(products: PosProduct[]): PosProduct[] {
  return products
    .map((product) =>
      product.isRoll
        ? { ...product, variants: product.variants.filter((variant) => variant.parentId !== null) }
        : product,
    )
    .filter((product) => product.variants.length > 0);
}

/** Terminal preload; `truncated` tells the client to search on the server instead. */
export async function getPosCatalog(session: Session) {
  assertPermission(session, "page:pos");
  const rows = await queryPosCatalog({ limit: PRELOAD_ROWS + 1 });
  const products = groupProducts(rows.slice(0, PRELOAD_ROWS));
  const truncated = rows.length > PRELOAD_ROWS || products.length > POS_PRELOAD_PRODUCTS;
  return { products: products.slice(0, POS_PRELOAD_PRODUCTS), truncated };
}

/** Server-side search for large catalogues; matches name, brand, motif, SKU and colour (FR-VAR-07). */
export async function searchPosCatalog(session: Session, term: string) {
  assertPermission(session, "page:pos");
  const search = term.trim().slice(0, 60);
  if (search === "") return [];
  return groupProducts(await queryPosCatalog({ limit: SEARCH_ROWS, search }));
}

/** Brand chips for the terminal; cashiers need no product-page access for this. */
export async function getPosBrands(session: Session) {
  assertPermission(session, "page:pos");
  const brands = await listBrands();
  return brands.filter((brand) => brand.productCount > 0).map(({ id, name }) => ({ id, name }));
}

/**
 * Product search for entering marketplace orders (FR-ONL-01); needs no POS
 * access.
 */
export async function searchOrderCatalog(session: Session, term: string) {
  assertPermission(session, "page:online-orders");
  const search = term.trim().slice(0, 60);
  if (search === "") return [];
  const rows = await queryPosCatalog({ limit: SEARCH_ROWS, search });
  return withoutRolls(groupProducts(rows));
}

/** Product search for goods a salesperson takes out (FR-CSG-02); needs no POS access. */
export async function searchConsignmentCatalog(session: Session, term: string) {
  assertPermission(session, "page:consignments");
  const search = term.trim().slice(0, 60);
  if (search === "") return [];
  return withoutRolls(groupProducts(await queryPosCatalog({ limit: SEARCH_ROWS, search })));
}
