import "server-only";

import { and, asc, eq, gt, gte, inArray, isNull, lt, sql } from "drizzle-orm";

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

/**
 * Stored checkout result for a key that is still valid at `now`, the same
 * clock that set its expiry (FR-POS-08).
 */
export async function findIdempotencyRecord(
  executor: Executor,
  userId: string,
  key: string,
  now: Date,
) {
  const [row] = await executor
    .select({ requestHash: idempotencyKeys.requestHash, response: idempotencyKeys.response })
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.key, key),
        gt(idempotencyKeys.expiresAt, now),
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

export interface SaleListQuery {
  start: Date;
  end: Date;
  /** Restricts to one cashier; null lists every cashier. */
  cashierId: string | null;
  invoice: string;
  method: "CASH" | "TRANSFER" | "KASBON" | undefined;
  status: (typeof sales.$inferSelect)["status"] | undefined;
  includeArchived: boolean;
}

function saleListConditions(query: SaleListQuery) {
  const conditions = [gte(sales.createdAt, query.start), lt(sales.createdAt, query.end)];
  if (query.cashierId) conditions.push(eq(sales.cashierId, query.cashierId));
  if (!query.includeArchived) conditions.push(isNull(sales.archivedAt));
  if (query.status) conditions.push(eq(sales.status, query.status));
  if (query.invoice !== "") {
    const pattern = `%${query.invoice.toUpperCase().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`upper(${sales.invoiceNo}) like ${pattern}`);
  }
  if (query.method === "KASBON") {
    conditions.push(sql`exists (select 1 from ${kasbons} where ${kasbons.saleId} = ${sales.id})`);
  } else if (query.method) {
    conditions.push(
      sql`exists (select 1 from ${payments} where ${payments.saleId} = ${sales.id} and ${payments.method} = ${query.method})`,
    );
  }
  return and(...conditions);
}

/** One page of sales, newest first, with cashier, methods and customer (FR-POS-10). */
export async function querySales(query: SaleListQuery, page: number, pageSize: number) {
  return db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      createdAt: sales.createdAt,
      status: sales.status,
      grandTotal: sales.grandTotal,
      cashierName: users.name,
      customerName: customers.name,
      methods: sql<string[]>`array(
        select distinct ${payments.method}::text from ${payments} where ${payments.saleId} = ${sales.id}
        union select 'KASBON' from ${kasbons} where ${kasbons.saleId} = ${sales.id}
      )`,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(saleListConditions(query))
    .orderBy(sql`${sales.createdAt} desc`, sql`${sales.id} desc`)
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
}

/** Count and total of the filtered sales; voided ones are counted but not summed. */
export async function summarizeSales(query: SaleListQuery) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      voided: sql<number>`count(*) filter (where ${sales.status} = 'VOIDED')`.mapWith(Number),
      total:
        sql<number>`coalesce(sum(${sales.grandTotal}) filter (where ${sales.status} <> 'VOIDED'), 0)`.mapWith(
          Number,
        ),
    })
    .from(sales)
    .where(saleListConditions(query));
  return { count: row?.count ?? 0, voided: row?.voided ?? 0, total: row?.total ?? 0 };
}

/** Cashiers who have sold anything, for the history filter. */
export async function listSellingCashiers() {
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(sales, eq(sales.cashierId, users.id))
    .orderBy(asc(users.name));
}
