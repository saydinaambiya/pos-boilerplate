import "server-only";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { recordAudit } from "@/lib/audit/audit";
import { changedFields } from "@/lib/audit/diff";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import {
  countProductsInCategory,
  deleteCategoryRow,
  findCategory,
  findProduct,
  insertCategory,
  insertProductWithDefaultVariant,
  listCategories,
  queryProducts,
  setProductActive,
  updateCategoryRow,
  updateProductWithDefaultVariant,
} from "./repository";
import type { CategoryInput, ProductDetailsInput, ProductFilters, ProductInput } from "./schemas";

export const PRODUCT_PAGE_SIZE = 50;

export type CatalogResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-found" | "name-taken" | "sku-taken" | "invalid-category" | "in-use" };

/** Blanks cost data for viewers without `product:view-cost` (FR-PRD-02). */
function withCostVisibility<T extends { cost: number }>(
  session: Session,
  row: T,
): Omit<T, "cost"> & { cost: number | null } {
  return session.permissions.has("product:view-cost") ? row : { ...row, cost: null };
}

export async function getCategories(session: Session) {
  assertPermission(session, "page:products");
  return listCategories();
}

export async function getCategory(session: Session, id: string) {
  assertPermission(session, "category:manage");
  return findCategory(id);
}

export async function createCategory(
  session: Session,
  input: CategoryInput,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "category:manage");
  try {
    const id = await db.transaction(async (tx) => {
      const created = await insertCategory(tx, input);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "category.created",
          entity: "category",
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

export async function updateCategory(
  session: Session,
  id: string,
  input: CategoryInput,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "category:manage");
  const current = await findCategory(id);
  if (!current) return { ok: false, reason: "not-found" };
  try {
    await db.transaction(async (tx) => {
      await updateCategoryRow(tx, id, input);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "category.updated",
          entity: "category",
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

/** Deletes an empty category; categories with products cannot be deleted (FR-CAT-01). */
export async function deleteCategory(
  session: Session,
  id: string,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "category:manage");
  const current = await findCategory(id);
  if (!current) return { ok: false, reason: "not-found" };
  if ((await countProductsInCategory(id)) > 0) return { ok: false, reason: "in-use" };
  await db.transaction(async (tx) => {
    await deleteCategoryRow(tx, id);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "category.deleted",
        entity: "category",
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

/** Creates a product with its hidden default variant in one transaction (FR-PRD-01, §3.1.1). */
export async function createProduct(
  session: Session,
  input: ProductInput,
  context: RequestContext,
): Promise<CatalogResult> {
  assertPermission(session, "product:create");
  if (!(await findCategory(input.categoryId))) return { ok: false, reason: "invalid-category" };
  const canSeeCost = session.permissions.has("product:view-cost");
  const { sku, minStock, cost, ...product } = input;
  const values = { ...product, cost: canSeeCost ? (cost ?? 0) : 0 };

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
  if (input.categoryId !== current.categoryId && !(await findCategory(input.categoryId))) {
    return { ok: false, reason: "invalid-category" };
  }
  const canSeeCost = session.permissions.has("product:view-cost");
  const { sku = current.sku, minStock = current.minStock, cost, ...product } = input;
  const values = { ...product, cost: canSeeCost ? (cost ?? current.cost) : current.cost };
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
