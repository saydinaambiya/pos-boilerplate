import "server-only";

import { db, type Executor } from "@/db/client";
import { uniqueViolationConstraint } from "@/db/errors";
import { recordStockMovement } from "@/features/stock/service";
import { recordAudit } from "@/lib/audit/audit";
import { changedFields } from "@/lib/audit/diff";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import { isProductSize } from "./sizes";
import {
  ensureDefectPiece,
  findDefaultVariant,
  findProduct,
  findVariant,
  insertPieces,
  insertVariant,
  listColorVariants,
  listPieces,
  markProductHasVariants,
  syncPieces,
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

/**
 * Colour variants of a product with the pieces cut from each roll
 * (FR-ROL-01).
 */
export async function getVariants(session: Session, productId: string) {
  assertPermission(session, "page:products");
  const rows = await listColorVariants(db, productId);
  const pieces = await listPieces(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    color: colorOf(row.attributes),
    pieces: pieces
      .filter((piece) => piece.parentId === row.id)
      .map(({ id, size, sku, stockQty, isDefect }) => ({ id, size, sku, stockQty, isDefect })),
  }));
}

/** A colour variant; pieces are edited through their roll, so they are not returned. */
export async function getVariant(session: Session, variantId: string) {
  assertPermission(session, "page:products");
  const row = await findVariant(variantId);
  if (row?.parentId !== null) return undefined;
  return { ...row, color: colorOf(row.attributes) };
}

/**
 * Moves the whole stock of one variant to another as a recorded pair of
 * `ADJUSTMENT` movements sharing `reference` (ADR-0008). Returns the moved
 * quantity.
 */
async function moveStock(
  tx: Executor,
  fromId: string,
  toId: string,
  actorId: string,
  reason: string,
  reference: { type: string; id: string },
): Promise<number> {
  const emptied = await recordStockMovement(
    tx,
    { variantId: fromId, type: "ADJUSTMENT", countedQty: 0, actorId, reason, reference },
    { allowNegative: true },
  );
  const moved = emptied.ok ? -emptied.qtyDelta : 0;
  if (moved === 0) return 0;
  await recordStockMovement(
    tx,
    { variantId: toId, type: "ADJUSTMENT", qtyDelta: moved, actorId, reason, reference },
    { allowNegative: true },
  );
  return moved;
}

/**
 * Turns on colour variants (FR-VAR-01, FR-VAR-06). The first colour variant
 * becomes the default; the hidden default is retired and its stock moves
 * across as a recorded pair of `ADJUSTMENT` movements, so the ledger of
 * both variants stays complete. See ADR-0008. On a roll product the first
 * colour gets its own pieces and each hidden piece's stock moves to the
 * piece of the same size (ADR-0023).
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
      await syncPieces(tx, hidden.id, { isActive: false });
      const attributes = attributesFor(input.colorName, input.hex);
      const firstId = await insertVariant(tx, {
        productId,
        sku: input.sku,
        attributes,
        minStock: input.minStock,
        isDefault: true,
        sortOrder: 0,
      });
      if (product.isRoll) {
        await insertPieces(tx, { id: firstId, productId, sku: input.sku, attributes });
      }
      await markProductHasVariants(tx, productId);

      let movedStock = 0;
      if (product.trackStock) {
        const reason = input.colorName;
        const reference = { type: "variant-activation", id: productId };
        if (hidden.stockQty !== 0) {
          movedStock = await moveStock(tx, hidden.id, firstId, session.user.id, reason, reference);
        }
        const [hiddenPieces, firstPieces] = await Promise.all([
          listPieces(tx, [hidden.id]),
          listPieces(tx, [firstId]),
        ]);
        for (const piece of hiddenPieces) {
          if (piece.stockQty === 0 || !isProductSize(piece.size)) continue;
          const targetId = piece.isDefect
            ? await ensureDefectPiece(
                tx,
                { id: firstId, productId, sku: input.sku, attributes, isActive: true },
                piece.size,
              )
            : firstPieces.find((candidate) => candidate.size === piece.size && !candidate.isDefect)
                ?.id;
          if (!targetId) continue;
          await moveStock(tx, piece.id, targetId, session.user.id, reason, reference);
        }
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
 * and therefore also needs `stock:adjust`. On a roll product the colour is
 * a roll with a piece per size, opening stock is centimetres of roll, and
 * prices come from the product (FR-ROL-01/02).
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

  try {
    const id = await db.transaction(async (tx) => {
      const existing = await listColorVariants(tx, productId);
      const sortOrder = Math.max(-1, ...existing.map((variant) => variant.sortOrder)) + 1;
      const attributes = attributesFor(input.colorName, input.hex);
      const variantId = await insertVariant(tx, {
        productId,
        sku: input.sku,
        attributes,
        minStock: input.minStock,
        priceOverride: product.isRoll ? null : input.priceOverride,
        sortOrder,
      });
      if (product.isRoll) {
        await insertPieces(tx, { id: variantId, productId, sku: input.sku, attributes });
      }
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

/**
 * Edits a colour variant. A roll's pieces follow its SKU and colour, and
 * roll colours take their prices from the product (ADR-0023).
 */
export async function updateVariant(
  session: Session,
  variantId: string,
  input: VariantInput,
  context: RequestContext,
): Promise<VariantResult> {
  assertPermission(session, "product:update");
  const current = await findVariant(variantId);
  const color = current ? colorOf(current.attributes) : null;
  if (!current || !color || current.parentId !== null) return { ok: false, reason: "not-found" };
  const values = {
    sku: input.sku,
    attributes: attributesFor(input.colorName, input.hex),
    minStock: input.minStock,
    priceOverride: current.isRoll ? null : input.priceOverride,
  };

  try {
    await db.transaction(async (tx) => {
      await updateVariantRow(tx, variantId, values);
      await syncPieces(tx, variantId, { sku: values.sku, attributes: values.attributes });
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
            },
            {
              sku: values.sku,
              color: input.colorName,
              hex: input.hex,
              minStock: values.minStock,
              priceOverride: values.priceOverride,
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

/**
 * Variants are deactivated, never deleted; the default stays active with
 * its product (FR-VAR-05). A roll's pieces follow its status.
 */
export async function changeVariantStatus(
  session: Session,
  variantId: string,
  isActive: boolean,
  context: RequestContext,
): Promise<VariantResult> {
  assertPermission(session, "product:update");
  const current = await findVariant(variantId);
  if (!current || !colorOf(current.attributes) || current.parentId !== null) {
    return { ok: false, reason: "not-found" };
  }
  if (!isActive && current.isDefault && current.productActive) {
    return { ok: false, reason: "default-variant" };
  }
  if (current.isActive === isActive) return { ok: true, id: variantId };
  await db.transaction(async (tx) => {
    await updateVariantRow(tx, variantId, { isActive });
    await syncPieces(tx, variantId, { isActive });
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
