import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import {
  consignments,
  invoiceCounters,
  kasbons,
  payments,
  productVariants,
  rolePermissions,
  roles,
  sales,
  stockMovements,
} from "@/db/schema";
import { createProduct } from "@/features/catalog/service";
import { checkout } from "@/features/checkout/service";
import { requestVoid } from "@/features/checkout/void-service";
import { createBankAccount } from "@/features/settings/service";
import { openShift } from "@/features/shifts/service";
import { receiveStock } from "@/features/stock/service";
import { ForbiddenError } from "@/lib/auth/authorize";
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

/** The store records goods `salesperson` takes; pickups are not the salesperson's job (ADR-0024). */
async function take(salesperson: Session, variantId: string, qty: number, now = MONDAY) {
  return takeGoods(
    await owner(),
    {
      idempotencyKey: crypto.randomUUID(),
      salespersonId: salesperson.user.id,
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
  await grant("page:consignments", "consignment:sell");
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
    const store = await owner();
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
    const first = await takeGoods(store, input, testContext(), MONDAY);
    const again = await takeGoods(store, input, testContext(), MONDAY);
    expect(again).toEqual({ ...first, replayed: true });
    expect(await stockOf(variantId)).toBe(2);
  });

  it("lets only pickup staff record pickups, for any salesperson (ADR-0024)", async () => {
    const session = await salesperson();
    const colleague = await other();
    const variantId = await product(5);
    const pickup = (actor: Session, salespersonId: string) =>
      takeGoods(
        actor,
        {
          idempotencyKey: crypto.randomUUID(),
          salespersonId,
          lines: [{ variantId, qty: 1 }],
          note: "",
        },
        testContext(),
        MONDAY,
      );
    expect(await pickup(session, session.user.id)).toEqual({ ok: false, reason: "forbidden" });

    await grant("consignment:pickup");
    expect((await pickup(await salesperson(), colleague.user.id)).ok).toBe(true);
    expect((await pickup(await owner(), session.user.id)).ok).toBe(true);
    expect(await getConsignments(await salesperson(), "OPEN")).toHaveLength(2);
    expect(await stockOf(variantId)).toBe(3);
  });
});

describe("settling goods (FR-CSG-03/04)", () => {
  it("records a sale for sold goods, restocks returns and keeps the rest out", async () => {
    await grant("page:pos");
    const session = await salesperson();
    await openShift(session, { openingCash: 0 }, testContext(), MONDAY);
    const variantId = await product(20);
    const id = consignmentId(await take(session, variantId, 10));

    expect(
      await settleGoods(
        session,
        id,
        settlement([{ variantId, sold: 4, returned: 2 }]),
        testContext(),
        TUESDAY,
      ),
    ).toEqual({ ok: false, reason: "forbidden" });
    const result = await settleGoods(
      session,
      id,
      settlement([{ variantId, sold: 4, returned: 0 }]),
      testContext(),
      TUESDAY,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.closed).toBe(false);
    expect(await stockOf(variantId)).toBe(10);
    const returned = await settleGoods(
      await owner(),
      id,
      settlement([{ variantId, sold: 0, returned: 2 }]),
      testContext(),
      TUESDAY,
    );
    expect(returned).toEqual({ ok: true, saleId: null, invoiceNo: null, closed: false });
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
    expect(detail?.batches.find((batch) => batch.invoiceNo)).toMatchObject({
      kind: "SETTLE",
      invoiceNo: result.invoiceNo,
    });

    await grant("consignment:return");
    const rest = await settleGoods(
      await salesperson(),
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

    await grant("consignment:return");
    expect(
      await settleGoods(
        await salesperson(),
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

  it("lets a salesperson without the cashier keep a shift and sell only carried goods (ADR-0029)", async () => {
    const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
    await db
      .delete(rolePermissions)
      .where(
        and(eq(rolePermissions.roleId, role?.id ?? ""), eq(rolePermissions.permission, "page:pos")),
      );
    const session = await salesperson();
    expect(session.permissions.has("page:pos")).toBe(false);
    const opened = await openShift(session, { openingCash: 0 }, testContext(), MONDAY);
    expect(opened.ok).toBe(true);
    const variantId = await product(10);
    const id = consignmentId(await take(session, variantId, 3));

    const result = await settleGoods(
      session,
      id,
      settlement([{ variantId, sold: 2, returned: 0 }]),
      testContext(),
      TUESDAY,
    );
    expect(result).toMatchObject({ ok: true, closed: false });
    expect(await stockOf(variantId)).toBe(7);

    await expect(
      checkout(
        session,
        {
          idempotencyKey: crypto.randomUUID(),
          lines: [{ variantId, qty: 1 }],
          payments: [{ method: "CASH", amount: 10_000 }],
          customer: { name: "Pembeli", phone: null },
        },
        testContext(),
        TUESDAY,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("takes part cash and the rest by transfer, and store credit without the cashier (ADR-0033)", async () => {
    const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
    await db
      .delete(rolePermissions)
      .where(
        and(eq(rolePermissions.roleId, role?.id ?? ""), eq(rolePermissions.permission, "page:pos")),
      );
    await grant("kasbon:create");
    const account = await createBankAccount(
      await owner(),
      { bankName: "BCA", accountNo: "1234567890", accountName: "Toko" },
      testContext(),
    );
    if (!account.ok) throw new Error(account.reason);
    const session = await salesperson();
    await openShift(session, { openingCash: 0 }, testContext(), MONDAY);
    const variantId = await product(10);
    const id = consignmentId(await take(session, variantId, 5));
    const rest = { method: "TRANSFER" as const, bankAccountId: account.id };

    expect(
      await settleGoods(
        session,
        id,
        settlement([{ variantId, sold: 2, returned: 0 }], { method: "SPLIT", cash: 20_000, rest }),
        testContext(),
        TUESDAY,
      ),
    ).toEqual({ ok: false, reason: "split-invalid" });

    const split = await settleGoods(
      session,
      id,
      settlement([{ variantId, sold: 2, returned: 0 }], { method: "SPLIT", cash: 5_000, rest }),
      testContext(),
      TUESDAY,
    );
    if (!split.ok) throw new Error(split.reason);
    const paid = await db
      .select({ method: payments.method, amount: payments.amount })
      .from(payments)
      .where(eq(payments.saleId, split.saleId ?? ""));
    expect(paid.sort((a, b) => a.method.localeCompare(b.method))).toEqual([
      { method: "CASH", amount: 5_000 },
      { method: "TRANSFER", amount: 15_000 },
    ]);

    const credit = await settleGoods(
      session,
      id,
      settlement(
        [{ variantId, sold: 1, returned: 0 }],
        { method: "KASBON", note: "", dueDate: null },
        { name: "Toko Maju", phone: "+6281234567890" },
      ),
      testContext(),
      TUESDAY,
    );
    expect(credit).toMatchObject({ ok: true });
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

  it("hides other salespeople's consignments from salespeople", async () => {
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
    expect(
      await settleGoods(
        await other(),
        id,
        settlement([{ variantId, sold: 1, returned: 0 }]),
        testContext(),
        TUESDAY,
      ),
    ).toEqual({ ok: false, reason: "forbidden" });
  });

  it("lets return staff see every salesperson and record returns only", async () => {
    const session = await salesperson();
    const variantId = await product(5);
    const id = consignmentId(await take(session, variantId, 2));
    await grant("consignment:return");
    const floor = await other();
    expect(await getConsignment(floor, id)).toBeDefined();
    expect(
      await settleGoods(
        floor,
        id,
        settlement([{ variantId, sold: 1, returned: 0 }]),
        testContext(),
        TUESDAY,
      ),
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(
      await settleGoods(
        floor,
        id,
        settlement([{ variantId, sold: 0, returned: 2 }]),
        testContext(),
        TUESDAY,
      ),
    ).toEqual({ ok: true, saleId: null, invoiceNo: null, closed: true });
  });
});
