import "server-only";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { recordAudit } from "@/lib/audit/audit";
import { changedFields } from "@/lib/audit/diff";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import {
  countProductsOfBrand,
  deleteBrandRow,
  findBrand,
  findProduct,
  insertBrand,
  insertProductWithDefaultVariant,
  listBrands,
  queryProducts,
  setProductActive,
  updateBrandRow,
  updateProductWithDefaultVariant,
} from "./repository";
import type { BrandInput, ProductDetailsInput, ProductFilters, ProductInput } from "./schemas";

export const PRODUCT_PAGE_SIZE = 50;

export type CatalogResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not-found" | "name-taken" | "sku-taken" | "invalid-brand" | "in-use";
    };

/** Blanks cost data for viewers without `product:view-cost` (FR-PRD-02). */
function withCostVisibility<T extends { cost: number }>(
  session: Session,
  row: T,
): Omit<T, "cost"> & { cost: number | null } {
  return session.permissions.has("product:view-cost") ? row : { ...row, cost: null };
}

export async function getBrands(session: Session) {
  assertPermission(session, "page:products");
  return listBrands();
}

/** Brand list management (FR-CAT-02, ADR-0022). */
export async function createBrand(
  session: Session,
  input: BrandInput,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "brand:manage");
  try {
    const id = await db.transaction(async (tx) => {
      const created = await insertBrand(tx, input);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "brand.created",
          entity: "brand",
          entityId: created,
          diff: input,
        },
        context,
      );
      return created;
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

export async function updateBrand(
  session: Session,
  id: string,
  input: BrandInput,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "brand:manage");
  const current = await findBrand(id);
  if (!current) return { ok: false, reason: "not-found" };
  try {
    await db.transaction(async (tx) => {
      await updateBrandRow(tx, id, input);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "brand.updated",
          entity: "brand",
          entityId: id,
          diff: changedFields(current, input),
        },
        context,
      );
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

/** Deletes a brand no product uses (FR-CAT-02). */
export async function deleteBrand(
  session: Session,
  id: string,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "brand:manage");
  const current = await findBrand(id);
  if (!current) return { ok: false, reason: "not-found" };
  if ((await countProductsOfBrand(id)) > 0) return { ok: false, reason: "in-use" };
  await db.transaction(async (tx) => {
    await deleteBrandRow(tx, id);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "brand.deleted",
        entity: "brand",
        entityId: id,
        diff: { name: current.name },
      },
      context,
    );
  });
  return { ok: true, id };
}

/** Product list with search and filters (FR-PRD-04); cost hidden per FR-PRD-02. */
export async function listProducts(session: Session, filters: ProductFilters) {
  assertPermission(session, "page:products");
  const rows = await queryProducts(filters, PRODUCT_PAGE_SIZE);
  return {
    products: rows.slice(0, PRODUCT_PAGE_SIZE).map((row) => withCostVisibility(session, row)),
    hasNextPage: rows.length > PRODUCT_PAGE_SIZE,
  };
}

export async function getProduct(session: Session, id: string) {
  assertPermission(session, "page:products");
  const row = await findProduct(id);
  return row ? withCostVisibility(session, row) : undefined;
}

/**
 * Creates a product with its hidden default variant in one transaction
 * (FR-PRD-01, §3.1.1). The create form requires brand, motif and size
 * (`newProductInput`, FR-PRD-06).
 */
export async function createProduct(
  session: Session,
  input: ProductInput,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "product:create");
  if (input.brandId && !(await findBrand(input.brandId))) {
    return { ok: false, reason: "invalid-brand" };
  }
  const canSeeCost = session.permissions.has("product:view-cost");
  const { sku, minStock, cost, brandId = null, motif = null, size = null, ...product } = input;
  const values = { ...product, brandId, motif, size, cost: canSeeCost ? (cost ?? 0) : 0 };

  try {
    const id = await db.transaction(async (tx) => {
      const created = await insertProductWithDefaultVariant(tx, values, { sku, minStock });
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "product.created",
          entity: "product",
          entityId: created,
          diff: { ...values, sku, minStock },
        },
        context,
      );
      return created;
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "sku-taken" };
    throw error;
  }
}

/**
 * Updates a product and, while it has no colour variants, its default
 * variant's SKU and minimum stock. Without `product:view-cost` the stored
 * cost is kept, since the editor never saw it (FR-PRD-02).
 */
export async function updateProduct(
  session: Session,
  id: string,
  input: ProductDetailsInput & { sku?: string; minStock?: number },
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "product:update");
  const current = await findProduct(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (input.brandId && input.brandId !== current.brandId && !(await findBrand(input.brandId))) {
    return { ok: false, reason: "invalid-brand" };
  }
  const canSeeCost = session.permissions.has("product:view-cost");
  const {
    sku = current.sku,
    minStock = current.minStock,
    cost,
    brandId = current.brandId,
    motif = current.motif,
    size = current.size,
    ...product
  } = input;
  const values = {
    ...product,
    brandId,
    motif,
    size,
    cost: canSeeCost ? (cost ?? current.cost) : current.cost,
  };
  const defaultVariant = current.hasVariants ? null : { sku, minStock };

  try {
    await db.transaction(async (tx) => {
      await updateProductWithDefaultVariant(tx, id, values, defaultVariant);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "product.updated",
          entity: "product",
          entityId: id,
          diff: changedFields(current, { ...values, ...defaultVariant }),
        },
        context,
      );
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "sku-taken" };
    throw error;
  }
}

/** Products are deactivated, never deleted, so sales history stays intact (FR-PRD-03). */
export async function changeProductStatus(
  session: Session,
  id: string,
  isActive: boolean,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "product:update");
  const current = await findProduct(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (current.isActive === isActive) return { ok: true, id };
  await db.transaction(async (tx) => {
    await setProductActive(tx, id, isActive);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: isActive ? "product.activated" : "product.deactivated",
        entity: "product",
        entityId: id,
      },
      context,
    );
  });
  return { ok: true, id };
}
