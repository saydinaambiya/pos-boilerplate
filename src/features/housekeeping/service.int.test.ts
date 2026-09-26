import { createHash } from "node:crypto";

import { eq, inArray, isNotNull } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import {
  archiveBatches,
  kasbons,
  onlineOrders,
  payments,
  productVariants,
  saleItems,
  sales,
  stockMovements,
} from "@/db/schema";
import { createCategory, createProduct } from "@/features/catalog/service";
import { checkout } from "@/features/checkout/service";
import { createOnlineOrder, listOnlineOrders } from "@/features/online-orders/service";
import { getSalesReport } from "@/features/reports/service";
import { createMarketplace, updateSettings } from "@/features/settings/service";
import { openShift } from "@/features/shifts/service";
import { receiveStock } from "@/features/stock/service";
import type { Session } from "@/lib/auth/session";
import { settingDefinitions } from "@/lib/settings/schemas";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { archiveMonth, exportMonthArchive, getHousekeeping } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);
const NOW = new Date("2026-09-26T05:00:00Z");
const MAY = new Date("2026-05-15T05:00:00Z");

async function setup() {
  const session = await owner();
  await updateSettings(
    session,
    "operations",
    { ...settingDefinitions.operations.defaults, housekeepingRetentionMonths: 3 },
    testContext(),
  );
  await openShift(session, { openingCash: 0 }, testContext());
  const category = await createCategory(session, { name: "Kaos", sortOrder: 0 }, testContext());
  if (!category.ok) throw new Error(category.reason);
  const product = await createProduct(
    session,
    {
      name: "Kaos",
      categoryId: category.id,
      price: 50_000,
      cost: 20_000,
      unit: "pcs",
      trackStock: true,
      sku: "KAOS-1",
      minStock: 0,
    },
    testContext(),
  );
  if (!product.ok) throw new Error(product.reason);
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  const variantId = variant?.id ?? "";
  await receiveStock(session, variantId, { qty: 20, note: "" }, testContext());
  return { session, variantId };
}

async function sell(session: Session, variantId: string, paid: number, credit = false) {
  const result = await checkout(
    session,
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ variantId, qty: 1 }],
      payments: paid > 0 ? [{ method: "CASH", amount: paid }] : [],
      ...(credit
        ? {
            kasbon: {
              customer: { name: "Bu Sari", phone: "+6281234567890", note: "" },
              dueDate: null,
            },
          }
        : {}),
    },
    testContext(),
    MAY,
  );
  if (!result.ok) throw new Error(result.reason);
  return result.saleId;
}

/** Moves everything created so far into May 2026. */
async function backdate() {
  await db.update(sales).set({ createdAt: MAY });
  await db.update(stockMovements).set({ createdAt: MAY });
  await db.update(onlineOrders).set({ createdAt: MAY });
}

async function download(session: Session, month: string) {
  const stream = await exportMonthArchive(session, month, testContext(), NOW);
  if (!stream) throw new Error("archive expected");
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return unzipSync(bytes);
}

beforeEach(resetDatabase);

describe("housekeeping (FR-HK-01..07)", () => {
  it("lists months past the retention period with their volume", async () => {
    const { session, variantId } = await setup();
    await sell(session, variantId, 50_000);
    await backdate();
    const data = await getHousekeeping(session, NOW);
    expect(data.latest).toBe("2026-06");
    expect(data.months.map((row) => [row.month, row.sales, row.exportedAt])).toEqual([
      ["2026-06", 0, null],
      ["2026-05", 1, null],
    ]);
    expect(await exportMonthArchive(session, "2026-07", testContext(), NOW)).toBeNull();
  });

  it("exports a ZIP with checksummed CSVs and records the batch", async () => {
    const { session, variantId } = await setup();
    await sell(session, variantId, 50_000);
    await backdate();

    const files = await download(session, "2026-05");
    expect(Object.keys(files).sort()).toEqual([
      "items.csv",
      "kasbon.csv",
      "manifest.json",
      "online-order-events.csv",
      "online-order-items.csv",
      "online-orders.csv",
      "payments.csv",
      "stock-movements.csv",
      "transactions.csv",
    ]);
    const transactions = strFromU8(files["transactions.csv"] ?? new Uint8Array());
    expect(transactions.split("\r\n")[0]).toContain("invoice_no");
    expect(transactions.split("\r\n").filter(Boolean)).toHaveLength(2);

    const manifest = JSON.parse(strFromU8(files["manifest.json"] ?? new Uint8Array())) as {
      rowCounts: Record<string, number>;
      checksums: Record<string, string>;
    };
    expect(manifest.rowCounts).toMatchObject({
      "transactions.csv": 1,
      "items.csv": 1,
      "payments.csv": 1,
      "stock-movements.csv": 2,
    });
    const digest = createHash("sha256")
      .update(files["transactions.csv"] ?? new Uint8Array())
      .digest("hex");
    expect(manifest.checksums["transactions.csv"]).toBe(digest);

    const [batch] = await db.select().from(archiveBatches);
    expect(batch).toMatchObject({ month: "2026-05", archivedAt: null });
    expect(batch?.checksums["transactions.csv"]).toBe(digest);
  });

  it("marks exported rows, skips unsettled credit and keeps them in reports", async () => {
    const { session, variantId } = await setup();
    const paidSale = await sell(session, variantId, 50_000);
    const creditSale = await sell(session, variantId, 10_000, true);
    const shopee = await createMarketplace(session, { name: "Shopee" }, testContext());
    if (!shopee.ok) throw new Error(shopee.reason);
    const order = await createOnlineOrder(
      session,
      {
        marketplaceId: shopee.id,
        orderCode: "OLD-1",
        lines: [{ variantId, qty: 1 }],
        shippingFee: 0,
        note: "",
      },
      testContext(),
    );
    if (!order.ok) throw new Error(order.reason);
    await db.update(onlineOrders).set({ status: "COMPLETED" }).where(eq(onlineOrders.id, order.id));
    await backdate();

    expect(await archiveMonth(session, "2026-05", testContext(), NOW)).toEqual({
      ok: false,
      reason: "not-exported",
    });
    await download(session, "2026-05");
    expect(await archiveMonth(session, "2026-05", testContext(), NOW)).toEqual({ ok: true });

    const archivedSales = await db
      .select({ id: sales.id })
      .from(sales)
      .where(isNotNull(sales.archivedAt));
    expect(archivedSales.map((row) => row.id)).toEqual([paidSale]);
    const [credit] = await db.select().from(kasbons).where(eq(kasbons.saleId, creditSale));
    expect(credit?.archivedAt).toBeNull();
    const creditItems = await db
      .select()
      .from(saleItems)
      .where(inArray(saleItems.saleId, [creditSale]));
    expect(creditItems.every((item) => item.archivedAt === null)).toBe(true);
    const creditPayments = await db.select().from(payments).where(eq(payments.saleId, creditSale));
    expect(creditPayments.every((payment) => payment.archivedAt === null)).toBe(true);

    const report = await getSalesReport(session, { from: "2026-05-01", to: "2026-05-31" }, NOW);
    expect(report.summary.count).toBe(2);
    const board = await listOnlineOrders(session, { status: undefined, search: "", page: 1 });
    expect(board.orders).toHaveLength(0);
    const withArchived = await listOnlineOrders(session, {
      status: undefined,
      search: "",
      page: 1,
      includeArchived: true,
    });
    expect(withArchived.orders.map((row) => row.orderCode)).toEqual(["OLD-1"]);

    expect(await archiveMonth(session, "2026-05", testContext(), NOW)).toEqual({
      ok: false,
      reason: "already-archived",
    });
    const again = await download(session, "2026-05");
    expect(Object.keys(again)).toContain("transactions.csv");
  });

  it("refuses to mark when the month changed after the download", async () => {
    const { session, variantId } = await setup();
    await sell(session, variantId, 50_000);
    await backdate();
    await download(session, "2026-05");
    await sell(session, variantId, 50_000);
    await backdate();
    expect(await archiveMonth(session, "2026-05", testContext(), NOW)).toEqual({
      ok: false,
      reason: "changed",
    });
  });

  it("is limited to page:housekeeping", async () => {
    const cashier = await signIn("kasir", "123456");
    await expect(getHousekeeping(cashier, NOW)).rejects.toThrow();
    await expect(exportMonthArchive(cashier, "2026-05", testContext(), NOW)).rejects.toThrow();
  });
});
