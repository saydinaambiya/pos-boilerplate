import "server-only";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { recordAudit } from "@/lib/audit/audit";
import { changedFields } from "@/lib/audit/diff";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import { colorHex } from "./options";
import {
  countProductsOfBrand,
  deleteBrandRow,
  findBrand,
  findProduct,
  insertBrand,
  insertProductWithDefaultVariant,
  listBrands,
  listThicknesses,
  markProductDeleted,
  queryProducts,
  updateBrandRow,
  updateProductWithDefaultVariant,
} from "./repository";
import type {
  BrandInput,
  ProductDetailsInput,
  ProductFilters,
  ProductInput,
  SizePrices,
} from "./schemas";

export type CatalogResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not-found" | "name-taken" | "sku-taken" | "invalid-brand" | "in-use";
    };

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

/** Product list with search, filters and sort, ten brands a page (FR-PRD-04, ADR-0041). */
export async function listProducts(session: Session, filters: ProductFilters) {
  assertPermission(session, "page:products");
  const page = await queryProducts(filters);
  return { products: page.rows, hasNextPage: page.hasNextPage };
}

/** Thicknesses for the product and stock filters (ADR-0041). */
export async function getThicknesses(session: Session) {
  if (!session.permissions.has("page:products")) assertPermission(session, "page:stock");
  return listThicknesses();
}

export async function getProduct(session: Session, id: string) {
  assertPermission(session, "page:products");
  return findProduct(id);
}

/**
 * Creates a product with its hidden default variant in one transaction
 * (FR-PRD-01, §3.1.1). Given size prices it is a roll product: the default
 * variant is a roll with a piece per size (FR-ROL-01). Given a colour, that
 * roll is the product's first colour instead of a hidden default. The create form
 * requires that, plus brand, motif and thickness (`newProductInput`,
 * FR-PRD-06).
 */
export async function createProduct(
  session: Session,
  input: ProductInput & { colorName?: string },
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "product:create");
  if (input.brandId && !(await findBrand(input.brandId))) {
    return { ok: false, reason: "invalid-brand" };
  }
  const {
    sku,
    minStock,
    brandId = null,
    motif = null,
    thickness = null,
    sizePrices = null,
    defectSizePrices = null,
    colorName,
    ...product
  } = input;
  const isRoll = sizePrices !== null;
  const hex = colorName === undefined ? undefined : colorHex(colorName);
  const color =
    colorName === undefined
      ? null
      : { color: hex ? { name: colorName, hex } : { name: colorName } };
  const values = {
    ...product,
    brandId,
    motif,
    thickness,
    sizePrices,
    defectSizePrices: isRoll ? defectSizePrices : null,
    isRoll,
    trackStock: isRoll || product.trackStock,
  };

  try {
    const id = await db.transaction(async (tx) => {
      const created = await insertProductWithDefaultVariant(
        tx,
        { ...values, hasVariants: color !== null },
        { sku, minStock, ...(color ? { attributes: color } : {}) },
      );
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "product.created",
          entity: "product",
          entityId: created,
          diff: { ...values, sku, minStock, ...(colorName ? { color: colorName } : {}) },
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
 * variant's SKU and minimum stock. Whether a product is a roll never
 * changes; a roll always tracks stock (ADR-0023).
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
  const {
    sku = current.sku,
    minStock = current.minStock,
    brandId = current.brandId,
    motif = current.motif,
    thickness = current.thickness,
    sizePrices = current.sizePrices as SizePrices | null,
    defectSizePrices = current.defectSizePrices as SizePrices | null,
    ...product
  } = input;
  const values = {
    ...product,
    brandId,
    motif,
    thickness,
    sizePrices: current.isRoll ? sizePrices : null,
    defectSizePrices: current.isRoll ? defectSizePrices : null,
    trackStock: current.isRoll || product.trackStock,
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

/**
 * Deletes a product in place of deactivating it: it leaves every list and
 * the POS, while past sales, stock movements and consignments keep their
 * rows and names (FR-PRD-03, ADR-0041).
 */
export async function deleteProduct(
  session: Session,
  id: string,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "product:update");
  const current = await findProduct(id);
  if (!current) return { ok: false, reason: "not-found" };
  await db.transaction(async (tx) => {
    await markProductDeleted(tx, id);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "product.deleted",
        entity: "product",
        entityId: id,
        diff: { name: current.name, sku: current.sku },
      },
      context,
    );
  });
  return { ok: true, id };
}
