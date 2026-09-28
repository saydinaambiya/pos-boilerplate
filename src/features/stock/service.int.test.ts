import { desc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { auditLogs, productVariants, stockMovements } from "@/db/schema";
import { createProduct } from "@/features/catalog/service";
import { updateSettings } from "@/features/settings/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { settingDefinitions } from "@/lib/settings/schemas";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import {
  countStock,
  getLowStock,
  getMovements,
  getStockLevels,
  MOVEMENT_PAGE_SIZE,
  receiveStock,
  writeOffStock,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

/** Creates a product and returns its default variant id. */
async function variant(options: { trackStock?: boolean; minStock?: number; sku?: string } = {}) {
  const session = await owner();
  const product = await createProduct(
    session,
    {
      name: `Produk ${options.sku ?? "A"}`,
      price: 10000,
      cost: 5000,
      unit: "pcs",
      trackStock: options.trackStock ?? true,
      sku: options.sku ?? "SKU-A",
      minStock: options.minStock ?? 2,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [row] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  if (!row) throw new Error("variant missing");
  return row.id;
}

async function stockOf(variantId: string): Promise<number> {
  const [row] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
  return row?.stockQty ?? Number.NaN;
}

/** FR-STK-02: the denormalised quantity always equals the ledger sum. */
async function expectLedgerMatches(variantId: string) {
  const [sum] = await db
    .select({ total: sql<number>`coalesce(sum(${stockMovements.qtyDelta}), 0)`.mapWith(Number) })
    .from(stockMovements)
    .where(eq(stockMovements.variantId, variantId));
  expect(await stockOf(variantId)).toBe(sum?.total);
}

beforeEach(resetDatabase);

describe("stock ledger (FR-STK-01..05)", () => {
  it("records goods received with the running total and an audit entry", async () => {
    const session = await owner();
    const id = await variant();
    const result = await receiveStock(session, id, { qty: 10, note: "Faktur 001" }, testContext());
    expect(result).toMatchObject({ ok: true, qtyDelta: 10, stockAfter: 10 });

    const [movement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.variantId, id));
    expect(movement).toMatchObject({
      type: "IN",
      qtyDelta: 10,
      stockAfter: 10,
      reason: "Faktur 001",
    });
    expect(movement?.actorId).toBe(session.user.id);
    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit).toMatchObject({ action: "stock.moved", entityId: id });
    await expectLedgerMatches(id);
  });

  it("records a stock count as the difference, including a zero difference", async () => {
    const session = await owner();
    const id = await variant();
    await receiveStock(session, id, { qty: 10, note: "" }, testContext());

    expect(
      await countStock(session, id, { counted: 7, reason: "Opname" }, testContext()),
    ).toMatchObject({
      ok: true,
      qtyDelta: -3,
      stockAfter: 7,
    });
    expect(
      await countStock(session, id, { counted: 7, reason: "Cek ulang" }, testContext()),
    ).toMatchObject({
      ok: true,
      qtyDelta: 0,
      stockAfter: 7,
    });
    await expectLedgerMatches(id);
  });

  it("refuses to go below zero unless negative stock is allowed (FR-STK-03/04)", async () => {
    const session = await owner();
    const id = await variant();
    await receiveStock(session, id, { qty: 2, note: "" }, testContext());

    expect(await writeOffStock(session, id, { qty: 3, reason: "Rusak" }, testContext())).toEqual({
      ok: false,
      reason: "insufficient-stock",
      available: 2,
    });
    expect(await stockOf(id)).toBe(2);

    await updateSettings(
      session,
      "operations",
      { ...settingDefinitions.operations.defaults, allowNegativeStock: true },
      testContext(),
    );
    expect(
      await writeOffStock(session, id, { qty: 3, reason: "Rusak" }, testContext()),
    ).toMatchObject({
      ok: true,
      stockAfter: -1,
    });
    await expectLedgerMatches(id);
  });

  it("never oversells under concurrent decreases (FR-STK-03)", async () => {
    const session = await owner();
    const id = await variant();
    await receiveStock(session, id, { qty: 5, note: "" }, testContext());

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        writeOffStock(session, id, { qty: 1, reason: "Uji" }, testContext()),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(5);
    expect(await stockOf(id)).toBe(0);
    await expectLedgerMatches(id);
  });

  it("rejects movements for products that do not track stock", async () => {
    const id = await variant({ trackStock: false });
    expect(await receiveStock(await owner(), id, { qty: 1, note: "" }, testContext())).toEqual({
      ok: false,
      reason: "not-tracked",
    });
  });

  it("requires stock:adjust to change and page:stock to view (NFR-SEC-07)", async () => {
    const id = await variant();
    const cashier = await signIn("kasir", "123456");
    await expect(
      receiveStock(cashier, id, { qty: 1, note: "" }, testContext()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getStockLevels(cashier, { q: "", page: 1 })).levels).toHaveLength(1);
  });
});

describe("stock views (FR-STK-06/07)", () => {
  it("filters history by type and pages with a cursor", async () => {
    const session = await owner();
    const id = await variant();
    for (let index = 0; index < MOVEMENT_PAGE_SIZE + 2; index += 1) {
      await receiveStock(session, id, { qty: 1, note: "" }, testContext());
    }
    await writeOffStock(session, id, { qty: 1, reason: "Rusak" }, testContext());

    const writeOffs = await getMovements(session, id, { type: "WRITE_OFF" });
    expect(writeOffs.movements.map((movement) => movement.qtyDelta)).toEqual([-1]);

    const first = await getMovements(session, id, {});
    expect(first.movements).toHaveLength(MOVEMENT_PAGE_SIZE);
    expect(first.movements[0]?.type).toBe("WRITE_OFF");
    const second = await getMovements(session, id, { cursor: first.nextCursor ?? undefined });
    expect(second.movements).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
  });

  it("lists low-stock variants, most depleted first", async () => {
    const session = await owner();
    const low = await variant({ sku: "LOW", minStock: 5 });
    const lower = await variant({ sku: "LOWER", minStock: 10 });
    const fine = await variant({ sku: "FINE", minStock: 1 });
    await receiveStock(session, low, { qty: 4, note: "" }, testContext());
    await receiveStock(session, lower, { qty: 1, note: "" }, testContext());
    await receiveStock(session, fine, { qty: 9, note: "" }, testContext());

    expect((await getLowStock(session)).map((item) => item.sku)).toEqual(["LOWER", "LOW"]);
    expect((await getStockLevels(session, { q: "", low: "1", page: 1 })).levels).toHaveLength(2);
    expect(
      (await getStockLevels(session, { q: "fine", page: 1 })).levels.map((item) => item.sku),
    ).toEqual(["FINE"]);
  });
});
