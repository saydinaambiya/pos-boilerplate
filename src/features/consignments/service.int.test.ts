import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import {
  consignments,
  invoiceCounters,
  kasbons,
  productVariants,
  rolePermissions,
  roles,
  sales,
  stockMovements,
} from "@/db/schema";
import { createProduct } from "@/features/catalog/service";
import { requestVoid } from "@/features/checkout/void-service";
import { openShift } from "@/features/shifts/service";
import { receiveStock } from "@/features/stock/service";
import type { Session } from "@/lib/auth/session";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import type { SettleGoodsInput } from "./schemas";
import { getConsignment, getConsignments, settleGoods, takeGoods } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const salesperson = () => signIn("kasir", "123456");
const other = () => signIn("kasir-baru", "111111");
const MONDAY = new Date("2026-09-28T03:00:00Z");
const TUESDAY = new Date("2026-09-29T03:00:00Z");

async function grant(...permissions: Permission[]) {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db
    .insert(rolePermissions)
    .values(permissions.map((permission) => ({ roleId: role?.id ?? "", permission })))
    .onConflictDoNothing();
}

let seq = 0;

/** A stock-tracked 10.000 rupiah product with `stock` units; returns its variant id. */
async function product(stock: number) {
  seq += 1;
  const session = await owner();
  const created = await createProduct(
    session,
    {
      name: `Barang ${String(seq)}`,
      price: 10_000,
      cost: 6_000,
      unit: "pcs",
      trackStock: true,
      sku: `CSG-${String(seq)}`,
      minStock: 0,
    },
    testContext(),
  );
  if (!created.ok) throw new Error(created.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, created.id));
  await receiveStock(session, variant?.id ?? "", { qty: stock, note: "" }, testContext());
  return variant?.id ?? "";
}

async function stockOf(variantId: string) {
  const [row] = await db.select().from(productVariants).where(eq(productVariants.id, variantId));
  return row?.stockQty;
}

function take(session: Session, variantId: string, qty: number, now = MONDAY) {
  return takeGoods(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      salespersonId: session.user.id,
      lines: [{ variantId, qty }],
      note: "",
    },
    testContext(),
    now,
  );
}

function settlement(
  lines: SettleGoodsInput["lines"],
  payment: SettleGoodsInput["payment"] = { method: "CASH" },
  customer: SettleGoodsInput["customer"] = { name: "Warung Bu Ani", phone: null },
): SettleGoodsInput {
  return { idempotencyKey: crypto.randomUUID(), lines, customer, payment, note: "" };
}

function consignmentId(result: Awaited<ReturnType<typeof take>>) {
  if (!result.ok) throw new Error(result.reason);
  return result.consignmentId;
}

beforeEach(async () => {
  await resetDatabase();
  await grant("page:consignments", "consignment:take");
});

describe("taking goods out (FR-CSG-01/02)", () => {
  it("takes stock off the shelf and keeps every day's pickup", async () => {
    const session = await salesperson();
    const variantId = await product(20);

    const id = consignmentId(await take(session, variantId, 5));
    expect(await stockOf(variantId)).toBe(15);
    expect(consignmentId(await take(session, variantId, 3, TUESDAY))).toBe(id);
    expect(await stockOf(variantId)).toBe(12);

    const detail = await getConsignment(session, id);
    expect(detail?.batches.map((batch) => batch.kind)).toEqual(["TAKE", "TAKE"]);
    expect(detail?.balances).toMatchObject([
      { variantId, taken: 8, sold: 0, returned: 0, outstanding: 8 },
    ]);
    const moves = await db
      .select()
      .from(stockMovements)
      .where(
        and(eq(stockMovements.variantId, variantId), eq(stockMovements.type, "CONSIGNMENT_OUT")),
      );
    expect(moves.map((move) => move.qtyDelta)).toEqual([-5, -3]);
  });

  it("refuses more than the stock and replays a retried pickup", async () => {
    const session = await salesperson();
    const variantId = await product(4);
    expect(await take(session, variantId, 5)).toEqual({
      ok: false,
      reason: "insufficient-stock",
      variantId,
      available: 4,
    });

    const input = {
      idempotencyKey: crypto.randomUUID(),
      salespersonId: session.user.id,
      lines: [{ variantId, qty: 2 }],
      note: "",
    };
    const first = await takeGoods(session, input, testContext(), MONDAY);
    const again = await takeGoods(session, input, testContext(), MONDAY);
    expect(again).toEqual({ ...first, replayed: true });
    expect(await stockOf(variantId)).toBe(2);
  });

  it("needs consignment:manage to act for someone else", async () => {
    const session = await salesperson();
    const colleague = await other();
    const variantId = await product(5);
    const result = await takeGoods(
      session,
      {
        idempotencyKey: crypto.randomUUID(),
        salespersonId: colleague.user.id,
        lines: [{ variantId, qty: 1 }],
        note: "",
      },
      testContext(),
      MONDAY,
    );
    expect(result).toEqual({ ok: false, reason: "forbidden" });

    const manager = await owner();
    const byOwner = await takeGoods(
      manager,
      {
        idempotencyKey: crypto.randomUUID(),
        salespersonId: session.user.id,
        lines: [{ variantId, qty: 1 }],
        note: "",
      },
      testContext(),
      MONDAY,
    );
    expect(byOwner.ok).toBe(true);
    expect(await getConsignments(colleague, "OPEN")).toEqual([]);
    expect(await getConsignments(manager, "OPEN")).toHaveLength(1);
  });
});

describe("settling goods (FR-CSG-03/04)", () => {
  it("records a sale for sold goods, restocks returns and keeps the rest out", async () => {
    await grant("page:pos");
    const session = await salesperson();
    await openShift(session, { openingCash: 0 }, testContext(), MONDAY);
    const variantId = await product(20);
    const id = consignmentId(await take(session, variantId, 10));

    const result = await settleGoods(
      session,
      id,
      settlement([{ variantId, sold: 4, returned: 2 }]),
      testContext(),
      TUESDAY,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.closed).toBe(false);
    expect(await stockOf(variantId)).toBe(12);

    const [sale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, result.saleId ?? ""));
    expect(sale).toMatchObject({
      consignmentId: id,
      grandTotal: 40_000,
      customerName: "Warung Bu Ani",
    });
    const saleMoves = await db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.variantId, variantId), eq(stockMovements.type, "SALE")));
    expect(saleMoves).toEqual([]);

    const detail = await getConsignment(session, id);
    expect(detail?.balances).toMatchObject([{ taken: 10, sold: 4, returned: 2, outstanding: 4 }]);
    expect(detail?.batches[0]).toMatchObject({ kind: "SETTLE", invoiceNo: result.invoiceNo });

    const rest = await settleGoods(
      session,
      id,
      settlement([{ variantId, sold: 0, returned: 4 }]),
      testContext(),
      TUESDAY,
    );
    expect(rest).toEqual({ ok: true, saleId: null, invoiceNo: null, closed: true });
    expect(await stockOf(variantId)).toBe(16);
    const [row] = await db.select().from(consignments).where(eq(consignments.id, id));
    expect(row?.status).toBe("CLOSED");

    const next = consignmentId(await take(session, variantId, 1, TUESDAY));
    expect(next).not.toBe(id);
  });

  it("rolls the sale back when more is settled than is outstanding", async () => {
    await grant("page:pos");
    const session = await salesperson();
    await openShift(session, { openingCash: 0 }, testContext(), MONDAY);
    const variantId = await product(10);
    const id = consignmentId(await take(session, variantId, 3));

    expect(
      await settleGoods(
        session,
        id,
        settlement([{ variantId, sold: 3, returned: 1 }]),
        testContext(),
        TUESDAY,
      ),
    ).toEqual({ ok: false, reason: "exceeds-outstanding" });
    expect(await db.select().from(sales)).toEqual([]);
    expect(await db.select().from(invoiceCounters)).toEqual([]);
    expect(await stockOf(variantId)).toBe(7);
  });

  it("needs an open shift for the money and puts store credit on the buyer", async () => {
    await grant("page:pos", "kasbon:create");
    const session = await salesperson();
    const variantId = await product(10);
    const id = consignmentId(await take(session, variantId, 3));

    expect(
      await settleGoods(
        session,
        id,
        settlement([{ variantId, sold: 1, returned: 0 }]),
        testContext(),
        TUESDAY,
      ),
    ).toEqual({ ok: false, reason: "sale-failed", sale: { ok: false, reason: "no-open-shift" } });

    await openShift(session, { openingCash: 0 }, testContext(), MONDAY);
    const credit = await settleGoods(
      session,
      id,
      settlement(
        [{ variantId, sold: 2, returned: 0 }],
        { method: "KASBON", note: "", dueDate: null },
        { name: "Toko Maju", phone: "+6281234567890" },
      ),
      testContext(),
      TUESDAY,
    );
    if (!credit.ok) throw new Error(credit.reason);
    const [kasbon] = await db
      .select()
      .from(kasbons)
      .where(eq(kasbons.saleId, credit.saleId ?? ""));
    expect(kasbon).toMatchObject({ total: 20_000, balance: 20_000 });
  });

  it("never voids a settlement sale (FR-CSG-06)", async () => {
    await grant("page:pos", "sale:void");
    const session = await salesperson();
    await openShift(session, { openingCash: 0 }, testContext(), MONDAY);
    const variantId = await product(10);
    const id = consignmentId(await take(session, variantId, 2));
    const result = await settleGoods(
      session,
      id,
      settlement([{ variantId, sold: 2, returned: 0 }]),
      testContext(),
      TUESDAY,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(
      await requestVoid(session, result.saleId ?? "", { reason: "salah" }, testContext()),
    ).toEqual({ ok: false, reason: "not-voidable" });
  });

  it("hides other salespeople's consignments without consignment:manage", async () => {
    const session = await salesperson();
    const variantId = await product(5);
    const id = consignmentId(await take(session, variantId, 1));
    expect(await getConsignment(await other(), id)).toBeUndefined();
    expect(
      await settleGoods(
        await other(),
        id,
        settlement([{ variantId, sold: 0, returned: 1 }]),
        testContext(),
        TUESDAY,
      ),
    ).toEqual({ ok: false, reason: "forbidden" });
  });
});
