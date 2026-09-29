import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import { productVariants, rolePermissions, roles, sales } from "@/db/schema";
import { createProduct } from "@/features/catalog/service";
import { openShift } from "@/features/shifts/service";
import type { Session } from "@/lib/auth/session";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { listSales, saleHistoryQuery } from "./history";
import { checkout } from "./service";
import { requestVoid } from "./void-service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const cashier = () => signIn("kasir", "123456");
const query = (raw: Record<string, string> = {}) => saleHistoryQuery.parse(raw);

async function grant(...permissions: Permission[]) {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db
    .insert(rolePermissions)
    .values(permissions.map((permission) => ({ roleId: role?.id ?? "", permission })))
    .onConflictDoNothing();
}

async function variant() {
  const session = await owner();
  const product = await createProduct(
    session,
    {
      name: "Kopi",
      price: 20_000,
      unit: "cup",
      trackStock: false,
      sku: "KOPI-1",
      minStock: 0,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [row] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  return row?.id ?? "";
}

async function sell(session: Session, variantId: string) {
  const result = await checkout(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      customer: { name: "Pembeli", phone: null },
      lines: [{ variantId, qty: 1 }],
      payments: [{ method: "CASH", amount: 20_000 }],
    },
    testContext(),
  );
  if (!result.ok) throw new Error(result.reason);
  return result;
}

beforeEach(resetDatabase);

describe("transaction history (FR-POS-10, FR-HK-04)", () => {
  it("shows cashiers their own sales and report viewers everyone's", async () => {
    const variantId = await variant();
    const ownerSession = await owner();
    const cashierSession = await cashier();
    await openShift(ownerSession, { openingCash: 0 }, testContext());
    await openShift(cashierSession, { openingCash: 0 }, testContext());
    await sell(ownerSession, variantId);
    const own = await sell(cashierSession, variantId);

    const mine = await listSales(cashierSession, query());
    expect(mine.seesAll).toBe(false);
    expect(mine.sales.map((sale) => sale.invoiceNo)).toEqual([own.invoiceNo]);
    expect(
      (await listSales(cashierSession, query({ cashier: ownerSession.user.id }))).sales,
    ).toHaveLength(1);

    const all = await listSales(ownerSession, query());
    expect(all.sales).toHaveLength(2);
    expect(all.cashiers.map((row) => row.name).sort()).toEqual(
      ["Kasir", fixtures.owner.name].sort(),
    );
    expect(all.summary).toEqual({ count: 2, voided: 0, total: 40_000 });
    expect(
      (await listSales(ownerSession, query({ cashier: cashierSession.user.id }))).sales,
    ).toHaveLength(1);

    await grant("report:view");
    expect((await listSales(await cashier(), query())).sales).toHaveLength(2);
  });

  it("filters by invoice, method, status and hides archived sales", async () => {
    const variantId = await variant();
    const session = await owner();
    await openShift(session, { openingCash: 0 }, testContext());
    const first = await sell(session, variantId);
    const second = await sell(session, variantId);
    await requestVoid(session, second.saleId, { reason: "Salah" }, testContext());

    const bySuffix = await listSales(
      session,
      query({ q: first.invoiceNo.slice(-4).toLowerCase() }),
    );
    expect(bySuffix.sales.map((sale) => sale.invoiceNo)).toEqual([first.invoiceNo]);
    expect((await listSales(session, query({ status: "VOIDED" }))).sales).toHaveLength(1);
    expect((await listSales(session, query({ method: "TRANSFER" }))).sales).toHaveLength(0);
    expect((await listSales(session, query({ method: "CASH" }))).sales[0]?.methods).toEqual([
      "CASH",
    ]);
    expect((await listSales(session, query())).summary).toEqual({
      count: 2,
      voided: 1,
      total: 20_000,
    });

    await db.update(sales).set({ archivedAt: new Date() }).where(eq(sales.id, first.saleId));
    expect((await listSales(session, query())).sales).toHaveLength(1);
    expect((await listSales(session, query({ archived: "1" }))).sales).toHaveLength(2);
    expect(
      (await listSales(session, query({ from: "2020-01-01", to: "2020-01-02" }))).sales,
    ).toEqual([]);
  });
});
