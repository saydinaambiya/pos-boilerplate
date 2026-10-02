import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { productVariants, stockMovements } from "@/db/schema";
import { createProduct } from "@/features/catalog/service";
import { searchPosCatalog } from "@/features/catalog/pos-catalog";
import { getStockLevels, receiveStock, setPieceMinimum } from "@/features/stock/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { cutRoll, getRecentCuts, getRolls } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const sizePrices = { "93x47": 50_000, "100x70": 60_000, "50x140": 55_000, "100x140": 110_000 };

/** A roll product with `cm` of roll; returns the roll and its pieces by size. */
async function roll(cm: number) {
  const session = await owner();
  const created = await createProduct(
    session,
    {
      name: "Karpet Mihrab",
      price: 100_000,
      unit: "pcs",
      trackStock: true,
      sku: "KRP-MHR",
      minStock: 0,
      sizePrices,
      defectSizePrices: { "93x47": 30_000, "100x70": 35_000, "50x140": 33_000, "100x140": 70_000 },
    },
    testContext(),
  );
  if (!created.ok) throw new Error(created.reason);
  const rows = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, created.id));
  const rollRow = rows.find((row) => row.parentId === null);
  if (!rollRow) throw new Error("roll expected");
  if (cm > 0) await receiveStock(session, rollRow.id, { qty: cm, note: "" }, testContext());
  return {
    rollId: rollRow.id,
    piece: (size: string) => rows.find((row) => row.size === size)?.id ?? "",
  };
}

async function stockOf(variantId: string) {
  const [row] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
  return row?.stockQty;
}

beforeEach(resetDatabase);

describe("cutting rolls (FR-ROL-03, ADR-0023)", () => {
  it("takes the length cut off the roll and adds the pieces it made", async () => {
    const session = await owner();
    const { rollId, piece } = await roll(4000);
    const key = crypto.randomUUID();
    const input = {
      idempotencyKey: key,
      lengthCm: 800,
      defect: false,
      pieces: [
        { size: "93x47" as const, qty: 4 },
        { size: "100x70" as const, qty: 2 },
        { size: "100x140" as const, qty: 3 },
      ],
    };

    expect(await cutRoll(session, rollId, input, testContext())).toEqual({
      ok: true,
      usedCm: 800,
      rollAfter: 3200,
      replayed: false,
    });
    expect(await stockOf(piece("93x47"))).toBe(4);
    expect(await stockOf(piece("100x70"))).toBe(2);
    expect(await stockOf(piece("100x140"))).toBe(3);
    expect(await stockOf(piece("50x140"))).toBe(0);

    expect(await cutRoll(session, rollId, input, testContext())).toMatchObject({
      ok: true,
      replayed: true,
    });
    expect(await stockOf(rollId)).toBe(3200);
    const moves = await db
      .select()
      .from(stockMovements)
      .where(
        and(eq(stockMovements.referenceType, "roll-cut"), eq(stockMovements.referenceId, key)),
      );
    expect(moves.map((move) => move.type)).toEqual(["CUT", "CUT", "CUT", "CUT"]);

    const [cut] = await getRecentCuts(session);
    expect(cut).toMatchObject({ usedCm: 800, stockAfter: 3200 });
    expect(cut?.pieces).toEqual([
      { size: "93x47", qty: 4 },
      { size: "100x70", qty: 2 },
      { size: "100x140", qty: 3 },
    ]);
    const {
      rolls: [listed],
    } = await getRolls(session, { q: "mihrab", page: 1 });
    expect(listed?.id).toBe(rollId);
    expect(listed?.pieces.map(({ size, stockQty }) => ({ size, stockQty }))).toEqual([
      { size: "93x47", stockQty: 4 },
      { size: "100x70", stockQty: 2 },
      { size: "50x140", stockQty: 0 },
      { size: "100x140", stockQty: 3 },
    ]);
  });

  it("never cuts more than the roll holds and only cuts rolls", async () => {
    const session = await owner();
    const { rollId, piece } = await roll(90);
    expect(
      await cutRoll(
        session,
        rollId,
        {
          idempotencyKey: crypto.randomUUID(),
          lengthCm: 100,
          defect: false,
          pieces: [{ size: "100x140", qty: 1 }],
        },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "insufficient-roll", available: 90, needed: 100 });
    expect(await stockOf(rollId)).toBe(90);
    expect(
      await cutRoll(
        session,
        piece("93x47"),
        {
          idempotencyKey: crypto.randomUUID(),
          lengthCm: 47,
          defect: false,
          pieces: [{ size: "93x47", qty: 1 }],
        },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("books a defect cut on flagged pieces of the same product at the defect price (FR-ROL-05)", async () => {
    const session = await owner();
    const { rollId, piece } = await roll(1000);
    const defectCut = (qty: number) =>
      cutRoll(
        session,
        rollId,
        {
          idempotencyKey: crypto.randomUUID(),
          lengthCm: 100,
          defect: true,
          pieces: [{ size: "93x47", qty }],
        },
        testContext(),
      );
    expect((await defectCut(2)).ok).toBe(true);
    expect((await defectCut(1)).ok).toBe(true);

    const defects = await db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.parentId, rollId), eq(productVariants.isDefect, true)));
    expect(defects).toHaveLength(1);
    expect(defects[0]).toMatchObject({ size: "93x47", sku: "KRP-MHR-93x47-D", stockQty: 3 });
    expect(await stockOf(piece("93x47"))).toBe(0);
    expect(await stockOf(rollId)).toBe(800);

    const [cut] = await getRecentCuts(session);
    expect(cut).toMatchObject({ defect: true, pieces: [{ size: "93x47", qty: 1 }] });
    const levels = await getStockLevels(session, {
      q: "mihrab",
      defect: "1",
      sort: "name",
      page: 1,
    });
    expect(levels.groups.map((group) => group.variantId)).toEqual([rollId]);
    expect(levels.groups[0]?.pieces.map((level) => level.variantId)).toEqual([defects[0]?.id]);
    const [pos] = await searchPosCatalog(session, "mihrab");
    expect(pos?.variants.find((variant) => variant.isDefect)).toMatchObject({ price: 30_000 });
  });

  it("adds piece stock only by cutting and needs the cutting page", async () => {
    const session = await owner();
    const { piece } = await roll(0);
    expect(
      await receiveStock(session, piece("93x47"), { qty: 1, note: "" }, testContext()),
    ).toEqual({ ok: false, reason: "cut-only" });

    const cashier = await signIn("kasir", "123456");
    await expect(getRolls(cashier, { q: "", page: 1 })).rejects.toThrow(ForbiddenError);
  });

  it("groups pieces under their roll and keeps a minimum on the 93x47 piece only (FR-STK-08/09)", async () => {
    const session = await owner();
    const { rollId, piece } = await roll(1000);

    const all = await getStockLevels(session, { q: "mihrab", sort: "name", page: 1 });
    expect(all.groups.map((group) => group.variantId)).toEqual([rollId]);
    expect(all.groups[0]?.pieces.map((item) => item.size)).toEqual([
      "93x47",
      "100x70",
      "50x140",
      "100x140",
    ]);
    expect(
      (await getStockLevels(session, { q: "mihrab", minimum: "1", sort: "name", page: 1 })).groups,
    ).toEqual([]);

    expect(await setPieceMinimum(session, piece("100x70"), { minStock: 3 }, testContext())).toEqual(
      { ok: false, reason: "not-found" },
    );
    expect(await setPieceMinimum(session, rollId, { minStock: 3 }, testContext())).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await setPieceMinimum(session, piece("93x47"), { minStock: 3 }, testContext())).toEqual({
      ok: true,
    });

    const withMinimum = await getStockLevels(session, {
      q: "",
      minimum: "1",
      sort: "name",
      page: 1,
    });
    expect(withMinimum.groups.map((group) => group.variantId)).toEqual([rollId]);
    expect(withMinimum.groups[0]?.pieces.map((item) => item.variantId)).toEqual([piece("93x47")]);
    const low = await getStockLevels(session, { q: "", low: "1", sort: "name", page: 1 });
    expect(low.groups[0]?.pieces.map((item) => item.variantId)).toEqual([piece("93x47")]);

    const cashier = await signIn("kasir", "123456");
    await expect(
      setPieceMinimum(cashier, piece("93x47"), { minStock: 1 }, testContext()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
