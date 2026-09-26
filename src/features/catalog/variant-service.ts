import "server-only";

import { db } from "@/db/client";
import { uniqueViolationConstraint } from "@/db/errors";
import { recordStockMovement } from "@/features/stock/service";
import { recordAudit } from "@/lib/audit/audit";
import { changedFields } from "@/lib/audit/diff";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import {
  findDefaultVariant,
  findProduct,
  findVariant,
  insertVariant,
  listColorVariants,
  markProductHasVariants,
  updateVariantRow,
} from "./repository";
import {
  colorOf,
  type EnableVariantsInput,
  type NewVariantInput,
  type VariantColor,
  type VariantInput,
} from "./schemas";

export type VariantResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason:
        | "not-found"
        | "sku-taken"
        | "color-taken"
        | "already-enabled"
        | "variants-disabled"
        | "default-variant"
        | "stock-forbidden";
    };

function attributesFor(colorName: string, hex: string): { color: VariantColor } {
  return { color: hex === "" ? { name: colorName } : { name: colorName, hex } };
}

/** Maps unique-index violations to the field that clashed. */
function clash(error: unknown): VariantResult | null {
  const constraint = uniqueViolationConstraint(error);
  if (constraint === "product_variants_sku_key") return { ok: false, reason: "sku-taken" };
  if (constraint === "product_variants_color_name_key") return { ok: false, reason: "color-taken" };
  return null;
}

/** Colour variants of a product; cost overrides hidden per FR-PRD-02. */
export async function getVariants(session: Session, productId: string) {
  assertPermission(session, "page:products");
  const canSeeCost = session.permissions.has("product:view-cost");
  const rows = await listColorVariants(db, productId);
  return rows.map((row) => ({
    ...row,
    color: colorOf(row.attributes),
    costOverride: canSeeCost ? row.costOverride : null,
  }));
}

export async function getVariant(session: Session, variantId: string) {
  assertPermission(session, "page:products");
  const row = await findVariant(variantId);
  if (!row) return undefined;
  const canSeeCost = session.permissions.has("product:view-cost");
  return {
    ...row,
    color: colorOf(row.attributes),
    costOverride: canSeeCost ? row.costOverride : null,
    productCost: canSeeCost ? row.productCost : null,
  };
}

/**
 * Turns on colour variants (FR-VAR-01, FR-VAR-06). The first colour variant
 * becomes the default; the hidden default is retired and its stock moves
 * across as a recorded pair of `ADJUSTMENT` movements, so the ledger of
 * both variants stays complete. See ADR-0008.
 */
export async function enableVariants(
  session: Session,
  productId: string,
  input: EnableVariantsInput,
  context: RequestContext,
): Promise<VariantResult> {
  assertPermission(session, "product:update");
  const product = await findProduct(productId);
  if (!product) return { ok: false, reason: "not-found" };
  if (product.hasVariants) return { ok: false, reason: "already-enabled" };

  try {
    const id = await db.transaction(async (tx) => {
      const hidden = await findDefaultVariant(tx, productId);
      if (!hidden) throw new Error(`Product ${productId} has no default variant`);
      await updateVariantRow(tx, hidden.id, { isDefault: false, isActive: false });
      const firstId = await insertVariant(tx, {
        productId,
        sku: input.sku,
        attributes: attributesFor(input.colorName, input.hex),
        minStock: input.minStock,
        isDefault: true,
        sortOrder: 0,
      });
      await markProductHasVariants(tx, productId);

      let movedStock = 0;
      if (product.trackStock && hidden.stockQty !== 0) {
        const reason = input.colorName;
        const reference = { type: "variant-activation", id: productId };
        const emptied = await recordStockMovement(
          tx,
          {
            variantId: hidden.id,
            type: "ADJUSTMENT",
            countedQty: 0,
            actorId: session.user.id,
            reason,
            reference,
          },
          { allowNegative: true },
        );
        movedStock = emptied.ok ? -emptied.qtyDelta : 0;
        await recordStockMovement(
          tx,
          {
            variantId: firstId,
            type: "ADJUSTMENT",
            qtyDelta: movedStock,
            actorId: session.user.id,
            reason,
            reference,
          },
          { allowNegative: true },
        );
      }

      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "product.variants-enabled",
          entity: "product",
          entityId: productId,
          diff: { firstVariant: firstId, color: input.colorName, sku: input.sku, movedStock },
        },
        context,
      );
      return firstId;
    });
    return { ok: true, id };
  } catch (error) {
    const mapped = clash(error);
    if (mapped) return mapped;
    throw error;
  }
}

/**
 * Adds a colour variant (FR-VAR-01/02). Opening stock is an `IN` movement
 * and therefore also needs `stock:adjust`.
 */
export async function createVariant(
  session: Session,
  productId: string,
  input: NewVariantInput,
  context: RequestContext,
): Promise<VariantResult> {
  assertPermission(session, "product:update");
  if (input.initialStock > 0 && !session.permissions.has("stock:adjust")) {
    return { ok: false, reason: "stock-forbidden" };
  }
  const product = await findProduct(productId);
  if (!product) return { ok: false, reason: "not-found" };
  if (!product.hasVariants) return { ok: false, reason: "variants-disabled" };
  const canSeeCost = session.permissions.has("product:view-cost");

  try {
    const id = await db.transaction(async (tx) => {
      const existing = await listColorVariants(tx, productId);
      const sortOrder = Math.max(-1, ...existing.map((variant) => variant.sortOrder)) + 1;
      const variantId = await insertVariant(tx, {
        productId,
        sku: input.sku,
        attributes: attributesFor(input.colorName, input.hex),
        minStock: input.minStock,
        priceOverride: input.priceOverride,
        costOverride: canSeeCost ? (input.costOverride ?? null) : null,
        sortOrder,
      });
      if (product.trackStock && input.initialStock > 0) {
        await recordStockMovement(
          tx,
          {
            variantId,
            type: "IN",
            qtyDelta: input.initialStock,
            actorId: session.user.id,
            reason: input.colorName,
            reference: { type: "variant-opening", id: variantId },
          },
          { allowNegative: false },
        );
      }
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "variant.created",
          entity: "product-variant",
          entityId: variantId,
          diff: {
            productId,
            color: input.colorName,
            hex: input.hex,
            sku: input.sku,
            initialStock: input.initialStock,
            priceOverride: input.priceOverride,
          },
        },
        context,
      );
      return variantId;
    });
    return { ok: true, id };
  } catch (error) {
    const mapped = clash(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** Edits a colour variant; the cost override is kept for editors who cannot see it. */
export async function updateVariant(
  session: Session,
  variantId: string,
  input: VariantInput,
  context: RequestContext,
): Promise<VariantResult> {
  assertPermission(session, "product:update");
  const current = await findVariant(variantId);
  const color = current ? colorOf(current.attributes) : null;
  if (!current || !color) return { ok: false, reason: "not-found" };
  const canSeeCost = session.permissions.has("product:view-cost");
  const values = {
    sku: input.sku,
    attributes: attributesFor(input.colorName, input.hex),
    minStock: input.minStock,
    priceOverride: input.priceOverride,
    costOverride: canSeeCost ? (input.costOverride ?? null) : current.costOverride,
  };

  try {
    await db.transaction(async (tx) => {
      await updateVariantRow(tx, variantId, values);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "variant.updated",
          entity: "product-variant",
          entityId: variantId,
          diff: changedFields(
            {
              sku: current.sku,
              color: color.name,
              hex: color.hex ?? "",
              minStock: current.minStock,
              priceOverride: current.priceOverride,
              costOverride: current.costOverride,
            },
            {
              sku: values.sku,
              color: input.colorName,
              hex: input.hex,
              minStock: values.minStock,
              priceOverride: values.priceOverride,
              costOverride: values.costOverride,
            },
          ),
        },
        context,
      );
    });
    return { ok: true, id: variantId };
  } catch (error) {
    const mapped = clash(error);
    if (mapped) return mapped;
    throw error;
  }
}

/** Variants are deactivated, never deleted; the default stays active with its product (FR-VAR-05). */
export async function changeVariantStatus(
  session: Session,
  variantId: string,
  isActive: boolean,
  context: RequestContext,
): Promise<VariantResult> {
  assertPermission(session, "product:update");
  const current = await findVariant(variantId);
  if (!current || !colorOf(current.attributes)) return { ok: false, reason: "not-found" };
  if (!isActive && current.isDefault && current.productActive) {
    return { ok: false, reason: "default-variant" };
  }
  if (current.isActive === isActive) return { ok: true, id: variantId };
  await db.transaction(async (tx) => {
    await updateVariantRow(tx, variantId, { isActive });
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: isActive ? "variant.activated" : "variant.deactivated",
        entity: "product-variant",
        entityId: variantId,
      },
      context,
    );
  });
  return { ok: true, id: variantId };
}

/** Swaps a variant with its neighbour in the display order (FR-VAR-08). */
export async function moveVariant(
  session: Session,
  variantId: string,
  direction: "up" | "down",
  context: RequestContext,
): Promise<VariantResult> {
  assertPermission(session, "product:update");
  const current = await findVariant(variantId);
  if (!current) return { ok: false, reason: "not-found" };

  await db.transaction(async (tx) => {
    const ordered = await listColorVariants(tx, current.productId);
    const index = ordered.findIndex((variant) => variant.id === variantId);
    const neighbour = ordered[direction === "up" ? index - 1 : index + 1];
    if (index < 0 || !neighbour) return;
    const renumbered = ordered.map((variant) => variant.id);
    renumbered[index] = neighbour.id;
    renumbered[direction === "up" ? index - 1 : index + 1] = variantId;
    for (const [sortOrder, id] of renumbered.entries()) {
      await updateVariantRow(tx, id, { sortOrder });
    }
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "variant.reordered",
        entity: "product-variant",
        entityId: variantId,
        diff: { direction },
      },
      context,
    );
  });
  return { ok: true, id: variantId };
}
