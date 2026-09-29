import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE } from "@/config/permissions";
import { db } from "@/db/client";
import { productVariants, rolePermissions, roles, stockMovements } from "@/db/schema";
import { receiveStock, writeOffStock } from "@/features/stock/service";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { NewVariantInput } from "./schemas";
import { createProduct, getProduct, listProducts, updateProduct } from "./service";
import {
  changeVariantStatus,
  createVariant,
  enableVariants,
  getVariants,
  moveVariant,
  updateVariant,
} from "./variant-service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

async function productWithStock(stock: number) {
  const session = await owner();
  const product = await createProduct(
    session,
    {
      name: "Kaos Polos",
      price: 50000,
      unit: "pcs",
      trackStock: true,
      sku: "KAOS",
      minStock: 1,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [hidden] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  if (stock > 0)
    await receiveStock(session, hidden?.id ?? "", { qty: stock, note: "" }, testContext());
  return { productId: product.id, hiddenId: hidden?.id ?? "" };
}

function newVariant(overrides: Partial<NewVariantInput> = {}): NewVariantInput {
  return {
    colorName: "Biru",
    hex: "#1E88E5",
    sku: "KAOS-BIRU",
    minStock: 2,
    priceOverride: null,
    initialStock: 0,
    ...overrides,
  };
}

async function ledgerSum(variantId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${stockMovements.qtyDelta}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(eq(stockMovements.variantId, variantId));
  return row?.total ?? Number.NaN;
}

beforeEach(resetDatabase);

describe("enabling variants (FR-VAR-01, FR-VAR-06, ADR-0008)", () => {
  it("moves the default flag and the stock to the first colour variant", async () => {
    const session = await owner();
    const { productId, hiddenId } = await productWithStock(7);

    const result = await enableVariants(
      session,
      productId,
      { colorName: "Merah", hex: "", sku: "KAOS-MERAH", minStock: 2 },
      testContext(),
    );
    if (!result.ok) throw new Error(result.reason);

    const [hidden] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, hiddenId));
    expect(hidden).toMatchObject({ isDefault: false, isActive: false, stockQty: 0 });
    const variants = await getVariants(session, productId);
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({
      id: result.id,
      isDefault: true,
      stockQty: 7,
      color: { name: "Merah" },
    });

    const moves = await db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.type, "ADJUSTMENT"), eq(stockMovements.referenceId, productId)));
    expect(moves.map((move) => move.qtyDelta).sort()).toEqual([-7, 7]);
    expect(await ledgerSum(hiddenId)).toBe(0);
    expect(await ledgerSum(result.id)).toBe(7);

    expect((await getProduct(session, productId))?.stockQty).toBe(7);
    expect(
      await enableVariants(
        session,
        productId,
        { colorName: "X", hex: "", sku: "X", minStock: 0 },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "already-enabled" });
  });

  it("records no movement when there is no stock to move", async () => {
    const { productId } = await productWithStock(0);
    await enableVariants(
      await owner(),
      productId,
      { colorName: "Hitam", hex: "", sku: "KAOS-H", minStock: 0 },
      testContext(),
    );
    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });
});

describe("colour variants (FR-VAR-01..05, FR-VAR-08)", () => {
  async function enabled() {
    const session = await owner();
    const { productId } = await productWithStock(4);
    const first = await enableVariants(
      session,
      productId,
      { colorName: "Merah", hex: "#E53935", sku: "KAOS-MERAH", minStock: 1 },
      testContext(),
    );
    if (!first.ok) throw new Error(first.reason);
    return { session, productId, firstId: first.id };
  }

  it("adds variants with opening stock and enforces unique colour and SKU", async () => {
    const { session, productId } = await enabled();
    const blue = await createVariant(
      session,
      productId,
      newVariant({ initialStock: 3 }),
      testContext(),
    );
    if (!blue.ok) throw new Error(blue.reason);
    expect(await ledgerSum(blue.id)).toBe(3);

    expect(
      await createVariant(
        session,
        productId,
        newVariant({ sku: "OTHER", colorName: "biru" }),
        testContext(),
      ),
    ).toEqual({
      ok: false,
      reason: "color-taken",
    });
    expect(
      await createVariant(
        session,
        productId,
        newVariant({ colorName: "Hijau", sku: "kaos-merah" }),
        testContext(),
      ),
    ).toEqual({
      ok: false,
      reason: "sku-taken",
    });

    const listed = await listProducts(session, { q: "", status: "active", page: 1 });
    expect(listed.products[0]).toMatchObject({ stockQty: 7, variantCount: 2, hasVariants: true });
  });

  it("finds products by colour name (FR-VAR-07)", async () => {
    const { session, productId } = await enabled();
    await createVariant(session, productId, newVariant(), testContext());
    const found = await listProducts(session, { q: "biru", status: "active", page: 1 });
    expect(found.products.map((product) => product.id)).toEqual([productId]);
  });

  it("inherits prices unless overridden (FR-VAR-02)", async () => {
    const { session, productId } = await enabled();
    const blue = await createVariant(
      session,
      productId,
      newVariant({ priceOverride: 55000 }),
      testContext(),
    );
    if (!blue.ok) throw new Error(blue.reason);

    const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
    await db
      .insert(rolePermissions)
      .values({ roleId: role?.id ?? "", permission: "product:update" });
    const cashier = await signIn("kasir", "123456");
    const seen = (await getVariants(cashier, productId)).find((variant) => variant.id === blue.id);
    expect(seen).toMatchObject({ priceOverride: 55000 });

    await updateVariant(
      cashier,
      blue.id,
      { colorName: "Biru Tua", hex: "#0D47A1", sku: "KAOS-BIRU", minStock: 2, priceOverride: null },
      testContext(),
    );
    const stored = (await getVariants(session, productId)).find(
      (variant) => variant.id === blue.id,
    );
    expect(stored).toMatchObject({
      priceOverride: null,
      color: { name: "Biru Tua" },
    });
  });

  it("requires stock:adjust for opening stock", async () => {
    const { productId } = await enabled();
    const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
    await db
      .insert(rolePermissions)
      .values({ roleId: role?.id ?? "", permission: "product:update" });
    const cashier = await signIn("kasir", "123456");
    expect(
      await createVariant(cashier, productId, newVariant({ initialStock: 5 }), testContext()),
    ).toEqual({
      ok: false,
      reason: "stock-forbidden",
    });
  });

  it("keeps the primary variant active while the product is active (FR-VAR-05)", async () => {
    const { session, productId, firstId } = await enabled();
    expect(await changeVariantStatus(session, firstId, false, testContext())).toEqual({
      ok: false,
      reason: "default-variant",
    });
    const blue = await createVariant(session, productId, newVariant(), testContext());
    if (!blue.ok) throw new Error(blue.reason);
    expect(await changeVariantStatus(session, blue.id, false, testContext())).toEqual({
      ok: true,
      id: blue.id,
    });
  });

  it("reorders variants by swapping neighbours (FR-VAR-08)", async () => {
    const { session, productId, firstId } = await enabled();
    const blue = await createVariant(session, productId, newVariant(), testContext());
    const green = await createVariant(
      session,
      productId,
      newVariant({ colorName: "Hijau", sku: "KAOS-H" }),
      testContext(),
    );
    if (!blue.ok || !green.ok) throw new Error("create failed");

    await moveVariant(session, green.id, "up", testContext());
    const names = async () =>
      (await getVariants(session, productId)).map((variant) => variant.color?.name);
    expect(await names()).toEqual(["Merah", "Hijau", "Biru"]);
    await moveVariant(session, firstId, "up", testContext());
    expect(await names()).toEqual(["Merah", "Hijau", "Biru"]);
  });

  it("stops the product form from overwriting variant SKUs", async () => {
    const { session, productId, firstId } = await enabled();
    const product = await getProduct(session, productId);
    if (!product) throw new Error("product missing");
    await updateProduct(
      session,
      productId,
      {
        name: "Kaos Premium",
        price: 60000,
        unit: "pcs",
        trackStock: true,
      },
      testContext(),
    );
    const [first] = await db.select().from(productVariants).where(eq(productVariants.id, firstId));
    expect(first?.sku).toBe("KAOS-MERAH");
  });

  it("keeps stock rules per variant (FR-STK-03)", async () => {
    const { session, firstId } = await enabled();
    expect(
      await writeOffStock(session, firstId, { qty: 5, reason: "Rusak" }, testContext()),
    ).toMatchObject({
      ok: false,
      reason: "insufficient-stock",
      available: 4,
    });
  });
});
