import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import {
  bankAccounts,
  customers,
  idempotencyKeys,
  invoiceCounters,
  kasbons,
  payments,
  products,
  productVariants,
  saleItems,
  sales,
  shifts,
  users,
  vouchers,
} from "@/db/schema";

import type { PreparedPayment } from "./payment-providers";

/**
 * The cashier's open shift, share-locked so it cannot be closed while this
 * sale is being written (FR-SHF-01).
 */
export async function lockOpenShiftForSale(executor: Executor, userId: string) {
  const [row] = await executor
    .select({ id: shifts.id })
    .from(shifts)
    .where(and(eq(shifts.userId, userId), isNull(shifts.closedAt)))
    .for("share");
  return row;
}

/** Variants being sold with the data needed for pricing and snapshots. */
export async function findSellableVariants(executor: Executor, variantIds: readonly string[]) {
  return executor
    .select({
      id: productVariants.id,
      productName: products.name,
      trackStock: products.trackStock,
      attributes: productVariants.attributes,
      price: sql<number>`coalesce(${productVariants.priceOverride}, ${products.price})`.mapWith(
        Number,
      ),
      cost: sql<number>`coalesce(${productVariants.costOverride}, ${products.cost})`.mapWith(
        Number,
      ),
      sellable: sql<boolean>`${products.isActive} AND ${productVariants.isActive}`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, [...variantIds]));
}

/**
 * Next invoice sequence for a store day. The upsert locks the counter row
 * until commit, so numbers are unique and a rolled-back sale leaves no gap
 * (FR-POS-07).
 */
export async function nextInvoiceSequence(executor: Executor, day: string): Promise<number> {
  const [row] = await executor
    .insert(invoiceCounters)
    .values({ date: day, lastSeq: 1 })
    .onConflictDoUpdate({
      target: invoiceCounters.date,
      set: { lastSeq: sql`${invoiceCounters.lastSeq} + 1` },
    })
    .returning({ lastSeq: invoiceCounters.lastSeq });
  if (!row) throw new Error("Invoice counter upsert returned no row");
  return row.lastSeq;
}

export async function insertSale(
  executor: Executor,
  values: typeof sales.$inferInsert,
): Promise<string> {
  const [row] = await executor.insert(sales).values(values).returning({ id: sales.id });
  if (!row) throw new Error("Sale insert returned no row");
  return row.id;
}

export async function insertSaleItems(
  executor: Executor,
  values: (typeof saleItems.$inferInsert)[],
) {
  if (values.length > 0) await executor.insert(saleItems).values(values);
}

export async function insertPayments(
  executor: Executor,
  saleId: string,
  prepared: readonly PreparedPayment[],
) {
  if (prepared.length > 0)
    await executor.insert(payments).values(prepared.map((payment) => ({ saleId, ...payment })));
}

export async function findIdempotencyRecord(executor: Executor, userId: string, key: string) {
  const [row] = await executor
    .select({ requestHash: idempotencyKeys.requestHash, response: idempotencyKeys.response })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.key, key),
        sql`${idempotencyKeys.expiresAt} > now()`,
      ),
    )
    .limit(1);
  return row;
}

export async function insertIdempotencyRecord(
  executor: Executor,
  values: { userId: string; key: string; requestHash: string; response: unknown; expiresAt: Date },
) {
  await executor.insert(idempotencyKeys).values(values);
}

/** A sale with its lines, payments, cashier and any store credit, for the receipt view. */
export async function findSaleDetail(saleId: string) {
  const [sale] = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      status: sales.status,
      createdAt: sales.createdAt,
      cashierId: sales.cashierId,
      cashierName: users.name,
      shiftId: sales.shiftId,
      subtotal: sales.subtotal,
      itemDiscountTotal: sales.itemDiscountTotal,
      voucherDiscount: sales.voucherDiscount,
      voucherCode: vouchers.code,
      serviceRateBps: sales.serviceRateBps,
      serviceAmount: sales.serviceAmount,
      ppnRateBps: sales.ppnRateBps,
      ppnAmount: sales.ppnAmount,
      priceIncludesTax: sales.priceIncludesTax,
      grandTotal: sales.grandTotal,
      paidTotal: sales.paidTotal,
      customerName: customers.name,
      kasbonId: kasbons.id,
      kasbonTotal: kasbons.total,
      kasbonBalance: kasbons.balance,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .leftJoin(vouchers, eq(vouchers.id, sales.voucherId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .leftJoin(kasbons, eq(kasbons.saleId, sales.id))
    .where(eq(sales.id, saleId))
    .limit(1);
  if (!sale) return undefined;

  const [items, paid] = await Promise.all([
    db
      .select({
        id: saleItems.id,
        nameSnapshot: saleItems.nameSnapshot,
        variantSnapshot: saleItems.variantSnapshot,
        unitPrice: saleItems.unitPrice,
        qty: saleItems.qty,
        discountAmount: saleItems.discountAmount,
        lineTotal: saleItems.lineTotal,
      })
      .from(saleItems)
      .where(eq(saleItems.saleId, saleId))
      .orderBy(asc(saleItems.sortOrder)),
    db
      .select({
        id: payments.id,
        method: payments.method,
        amount: payments.amount,
        reference: payments.reference,
        bankName: bankAccounts.bankName,
        accountNo: bankAccounts.accountNo,
      })
      .from(payments)
      .leftJoin(bankAccounts, eq(bankAccounts.id, payments.bankAccountId))
      .where(eq(payments.saleId, saleId))
      .orderBy(asc(payments.createdAt)),
  ]);
  return { ...sale, items, payments: paid };
}

/** Locks a sale row for a status change such as a void (FR-POS-09). */
export async function lockSale(executor: Executor, saleId: string) {
  const [row] = await executor
    .select({
      id: sales.id,
      status: sales.status,
      invoiceNo: sales.invoiceNo,
      voucherId: sales.voucherId,
    })
    .from(sales)
    .where(eq(sales.id, saleId))
    .for("update");
  return row;
}

export async function setSaleStatus(
  executor: Executor,
  saleId: string,
  status: (typeof sales.$inferSelect)["status"],
): Promise<void> {
  await executor.update(sales).set({ status }).where(eq(sales.id, saleId));
}

/** Sold quantities per stock-tracked variant, to put back on void. */
export async function soldTrackedQuantities(executor: Executor, saleId: string) {
  return executor
    .select({
      variantId: saleItems.variantId,
      qty: sql<number>`sum(${saleItems.qty})`.mapWith(Number),
    })
    .from(saleItems)
    .innerJoin(productVariants, eq(productVariants.id, saleItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(saleItems.saleId, saleId), eq(products.trackStock, true)))
    .groupBy(saleItems.variantId)
    .orderBy(saleItems.variantId);
}
