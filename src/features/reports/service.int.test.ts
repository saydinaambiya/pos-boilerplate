import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, type Permission } from "@/config/permissions";
import { db } from "@/db/client";
import { recordExpense } from "@/features/expenses/service";
import {
  cashExpenses,
  onlineOrders,
  productVariants,
  rolePermissions,
  roles,
  sales,
} from "@/db/schema";
import { createBrand, createProduct } from "@/features/catalog/service";
import { checkout } from "@/features/checkout/service";
import { requestVoid } from "@/features/checkout/void-service";
import { createOnlineOrder } from "@/features/online-orders/service";
import { createMarketplace, updateSettings } from "@/features/settings/service";
import { openShift } from "@/features/shifts/service";
import type { Session } from "@/lib/auth/session";
import { settingDefinitions } from "@/lib/settings/schemas";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { reportCsv } from "./export";
import { getSalesReport, getTodaySales } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const cashier = () => signIn("kasir", "123456");
const NOW = new Date("2026-09-26T05:00:00Z");
const RANGE = { from: "2026-09-01", to: "2026-09-30" };

async function grant(...permissions: Permission[]) {
  const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
  await db
    .insert(rolePermissions)
    .values(permissions.map((permission) => ({ roleId: role?.id ?? "", permission })))
    .onConflictDoNothing();
}

/** An untracked product priced 50.000 with cost 20.000. */
async function product(name: string, brandId?: string) {
  const session = await owner();
  const created = await createProduct(
    session,
    {
      name,
      price: 50_000,
      unit: "pcs",
      trackStock: false,
      sku: `SKU-${name}`,
      minStock: 0,
      ...(brandId ? { brandId } : {}),
    },
    testContext(),
  );
  if (!created.ok) throw new Error(created.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, created.id));
  return variant?.id ?? "";
}

async function sell(session: Session, variantId: string, qty: number, amount: number) {
  const result = await checkout(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      customer: { name: "Pembeli", phone: null },
      lines: [{ variantId, qty }],
      payments: [{ method: "CASH", amount }],
    },
    testContext(),
  );
  if (!result.ok) throw new Error(result.reason);
  await db.update(sales).set({ createdAt: NOW }).where(eq(sales.id, result.saleId));
  return result.saleId;
}

beforeEach(resetDatabase);

describe("sales report (FR-RPT-01..04)", () => {
  it("sums non-voided sales by product, method, employee and day", async () => {
    const session = await owner();
    await openShift(session, { openingCash: 0 }, testContext());
    const brand = await createBrand(await owner(), { name: "Turkiye" }, testContext());
    if (!brand.ok) throw new Error(brand.reason);
    const kaos = await product("Kaos", brand.id);
    const topi = await product("Topi");
    await sell(session, kaos, 2, 100_000);
    await sell(session, topi, 1, 50_000);
    const voided = await sell(session, topi, 1, 50_000);
    await requestVoid(session, voided, { reason: "Salah" }, testContext());

    const report = await getSalesReport(session, RANGE, NOW);
    expect(report.summary).toMatchObject({
      count: 2,
      grandTotal: 150_000,
      netSales: 150_000,
      average: 75_000,
      expenses: 0,
      balance: 150_000,
    });
    expect(report.products.map((row) => [row.name, row.qty, row.revenue])).toEqual([
      ["Kaos", 2, 100_000],
      ["Topi", 1, 50_000],
    ]);
    expect(report.methods.find((row) => row.method === "CASH")).toMatchObject({
      count: 2,
      total: 150_000,
    });
    expect(report.daily).toEqual([
      {
        day: "2026-09-26",
        count: 2,
        grandTotal: 150_000,
        net: 150_000,
        expenses: 0,
        balance: 150_000,
      },
    ]);
    expect(report.employees).toHaveLength(1);
    expect(report.brands.map((row) => [row.name, row.qty, row.revenue])).toEqual([
      ["Turkiye", 2, 100_000],
      [null, 1, 50_000],
    ]);
    const csv = [...reportCsv(report, "brands", "id")].join("").split("\r\n");
    expect(csv[2]?.startsWith("Tanpa merk,")).toBe(true);
  });

  it("reports sales results only, without cost or profit (ADR-0027)", async () => {
    await grant("report:view");
    const session = await cashier();
    await openShift(session, { openingCash: 0 }, testContext());
    await sell(session, await product("Kaos"), 1, 50_000);

    const report = await getSalesReport(session, RANGE, NOW);
    expect(report.summary).not.toHaveProperty("grossProfit");
    expect(report.products[0]).not.toHaveProperty("margin");
    expect([...reportCsv(report, "products", "id")][0]).toBe(
      "Produk,Qty,Diskon item,Penjualan\r\n",
    );
  });

  it("subtracts staff expenses from the day's sales (FR-EXP-02)", async () => {
    const session = await owner();
    await openShift(session, { openingCash: 100_000 }, testContext());
    await sell(session, await product("Kaos"), 2, 100_000);
    const kasir = await cashier();
    const meal = await recordExpense(
      session,
      { category: "MEAL", recipientId: kasir.user.id, amount: 25_000, note: "" },
      testContext(),
    );
    const donation = await recordExpense(
      session,
      { category: "DONATION", recipientId: null, amount: 10_000, note: "Masjid" },
      testContext(),
    );
    if (!meal.ok || !donation.ok) throw new Error("expense expected");
    await db.update(cashExpenses).set({ createdAt: NOW });

    const report = await getSalesReport(session, RANGE, NOW);
    expect(report.summary).toMatchObject({
      grandTotal: 100_000,
      expenses: 35_000,
      balance: 65_000,
    });
    expect(report.daily).toEqual([
      expect.objectContaining({ day: "2026-09-26", expenses: 35_000, balance: 65_000 }),
    ]);
    expect(report.expenses.map((row) => [row.category, row.count, row.total])).toEqual([
      ["MEAL", 1, 25_000],
      ["DONATION", 1, 10_000],
    ]);
    const csv = [...reportCsv(report, "expenses", "id")].join("").split("\r\n");
    expect(csv[1]).toBe("Uang makan,1,25000");
  });

  it("separates PPN and service, and counts marketplace orders", async () => {
    const session = await owner();
    await updateSettings(
      session,
      "tax",
      {
        ...settingDefinitions.tax.defaults,
        ppnEnabled: true,
        ppnRateBps: 1100,
        serviceEnabled: true,
        serviceRateBps: 500,
      },
      testContext(),
    );
    await openShift(session, { openingCash: 0 }, testContext());
    const kaos = await product("Kaos");
    await sell(session, kaos, 1, 58_275);

    const shopee = await createMarketplace(session, { name: "Shopee" }, testContext());
    if (!shopee.ok) throw new Error(shopee.reason);
    const orderResult = await createOnlineOrder(
      session,
      {
        marketplaceId: shopee.id,
        orderCode: "SHP-1",
        lines: [{ variantId: kaos, qty: 2, unitPrice: 50_000 }],
        shippingFee: 9000,
        note: "",
      },
      testContext(),
    );
    if (!orderResult.ok) throw new Error(orderResult.reason);
    await db
      .update(onlineOrders)
      .set({ createdAt: NOW })
      .where(eq(onlineOrders.id, orderResult.id));

    const report = await getSalesReport(session, RANGE, NOW);
    expect(report.tax).toEqual([
      expect.objectContaining({
        ppnRateBps: 1100,
        serviceRateBps: 500,
        base: 50_000,
        service: 2500,
        ppn: 5775,
      }),
    ]);
    expect(report.online).toMatchObject({ count: 1, itemsTotal: 100_000, shipping: 9000 });
    expect(report.methods.find((row) => row.method === "MARKETPLACE")?.total).toBe(100_000);
  });

  it("gives today's figures only to report viewers (FR-DSH-01)", async () => {
    const session = await owner();
    await openShift(session, { openingCash: 0 }, testContext());
    await sell(session, await product("Kaos"), 1, 50_000);
    expect(await getTodaySales(session, NOW)).toEqual({
      count: 1,
      grandTotal: 50_000,
      average: 50_000,
    });
    expect(await getTodaySales(await cashier(), NOW)).toBeNull();
  });
});
