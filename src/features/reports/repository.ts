import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  sql,
  type AnyColumn,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  bankAccounts,
  brands,
  cashDeposits,
  cashExpenses,
  kasbons,
  onlineOrderItems,
  onlineOrders,
  payments,
  products,
  productVariants,
  saleItems,
  sales,
  shifts,
  users,
  vouchers,
} from "@/db/schema";

/** Half-open UTC range `[start, end)` of whole store days, with the store time zone. */
export interface ReportWindow {
  start: Date;
  end: Date;
  timeZone: string;
}

const num = (expression: ReturnType<typeof sql>) =>
  sql<number>`coalesce(${expression}, 0)`.mapWith(Number);

const counted = (window: ReportWindow) =>
  and(
    gte(sales.createdAt, window.start),
    lt(sales.createdAt, window.end),
    ne(sales.status, "VOIDED"),
  );

const liveOrders = (window: ReportWindow) =>
  and(
    gte(onlineOrders.createdAt, window.start),
    lt(onlineOrders.createdAt, window.end),
    notInArray(onlineOrders.status, ["CANCELLED", "RETURNED"]),
  );

const cogs = sql`sum(${saleItems.unitCost} * ${saleItems.qty})`;

/**
 * Totals of non-voided POS sales (FR-RPT-01..04). Net sales exclude PPN and
 * service, so they are comparable with cost of goods.
 */
export async function salesSummary(window: ReportWindow) {
  const [totals] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      subtotal: num(sql`sum(${sales.subtotal})`),
      itemDiscounts: num(sql`sum(${sales.itemDiscountTotal})`),
      voucherDiscounts: num(sql`sum(${sales.voucherDiscount})`),
      service: num(sql`sum(${sales.serviceAmount})`),
      ppn: num(sql`sum(${sales.ppnAmount})`),
      grandTotal: num(sql`sum(${sales.grandTotal})`),
    })
    .from(sales)
    .where(counted(window));
  const [cost] = await db
    .select({ cogs: num(cogs) })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(counted(window));
  return { ...totals, cogs: cost?.cogs ?? 0 } as {
    count: number;
    subtotal: number;
    itemDiscounts: number;
    voucherDiscounts: number;
    service: number;
    ppn: number;
    grandTotal: number;
    cogs: number;
  };
}

/** Marketplace orders still counting as sold (not cancelled or returned). */
export async function onlineSummary(window: ReportWindow) {
  const [totals] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      itemsTotal: num(sql`sum(${onlineOrders.itemsTotal})`),
      shipping: num(sql`sum(${onlineOrders.shippingFee})`),
    })
    .from(onlineOrders)
    .where(liveOrders(window));
  const [cost] = await db
    .select({ cogs: num(sql`sum(${onlineOrderItems.unitCost} * ${onlineOrderItems.qty})`) })
    .from(onlineOrderItems)
    .innerJoin(onlineOrders, eq(onlineOrders.id, onlineOrderItems.orderId))
    .where(liveOrders(window));
  return {
    count: totals?.count ?? 0,
    itemsTotal: totals?.itemsTotal ?? 0,
    shipping: totals?.shipping ?? 0,
    cogs: cost?.cogs ?? 0,
  };
}

/** Sales per store day. */
export async function salesByDay(window: ReportWindow) {
  const day = sql<string>`to_char((${sales.createdAt} at time zone ${window.timeZone})::date, 'YYYY-MM-DD')`;
  return db
    .select({
      day,
      count: sql<number>`count(*)`.mapWith(Number),
      grandTotal: num(sql`sum(${sales.grandTotal})`),
      net: num(sql`sum(${sales.grandTotal} - ${sales.ppnAmount} - ${sales.serviceAmount})`),
    })
    .from(sales)
    .where(counted(window))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

/** Staff expenses paid from the drawer per store day (FR-EXP-02, FR-RPT-01). */
export async function expensesByDay(window: ReportWindow) {
  const day = sql<string>`to_char((${cashExpenses.createdAt} at time zone ${window.timeZone})::date, 'YYYY-MM-DD')`;
  return db
    .select({ day, total: num(sql`sum(${cashExpenses.amount})`) })
    .from(cashExpenses)
    .where(and(gte(cashExpenses.createdAt, window.start), lt(cashExpenses.createdAt, window.end)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

/** Staff expenses per kind in the range (FR-EXP-02). */
export async function expensesByCategory(window: ReportWindow) {
  return db
    .select({
      category: cashExpenses.category,
      count: sql<number>`count(*)`.mapWith(Number),
      total: num(sql`sum(${cashExpenses.amount})`),
    })
    .from(cashExpenses)
    .where(and(gte(cashExpenses.createdAt, window.start), lt(cashExpenses.createdAt, window.end)))
    .groupBy(cashExpenses.category)
    .orderBy(cashExpenses.category);
}

/** Settled POS payments per method (FR-RPT-01). */
export async function paymentsByMethod(window: ReportWindow) {
  return db
    .select({
      method: payments.method,
      count: sql<number>`count(*)`.mapWith(Number),
      total: num(sql`sum(${payments.amount})`),
    })
    .from(payments)
    .innerJoin(sales, eq(sales.id, payments.saleId))
    .where(and(counted(window), eq(payments.status, "SETTLED")))
    .groupBy(payments.method);
}

/** Store credit given on sales in the range. */
export async function creditGiven(window: ReportWindow) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      total: num(sql`sum(${kasbons.total})`),
    })
    .from(kasbons)
    .innerJoin(sales, eq(sales.id, kasbons.saleId))
    .where(counted(window));
  return { count: row?.count ?? 0, total: row?.total ?? 0 };
}

/** Store credit installments approved in the range, by approval time. */
export async function creditCollected(window: ReportWindow) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      total: num(sql`sum(${payments.amount})`),
    })
    .from(payments)
    .where(
      and(
        isNotNull(payments.kasbonId),
        eq(payments.status, "SETTLED"),
        gte(payments.updatedAt, window.start),
        lt(payments.updatedAt, window.end),
      ),
    );
  return { count: row?.count ?? 0, total: row?.total ?? 0 };
}

const lineColumns = {
  qty: num(sql`sum(${saleItems.qty})`),
  revenue: num(sql`sum(${saleItems.lineTotal})`),
  discounts: num(sql`sum(${saleItems.discountAmount})`),
  cogs: num(cogs),
};

/** Lines per product, best sellers first. */
export async function salesByProduct(window: ReportWindow) {
  return db
    .select({ id: products.id, name: products.name, ...lineColumns })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(productVariants, eq(productVariants.id, saleItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(counted(window))
    .groupBy(products.id, products.name)
    .orderBy(desc(sql`sum(${saleItems.lineTotal})`), asc(products.name));
}

/** Lines per variant with the colour as sold. */
export async function salesByVariant(window: ReportWindow) {
  return db
    .select({
      id: saleItems.variantId,
      sku: productVariants.sku,
      name: sql<string>`max(${saleItems.nameSnapshot})`,
      color: sql<string | null>`max(${saleItems.variantSnapshot})`,
      ...lineColumns,
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(productVariants, eq(productVariants.id, saleItems.variantId))
    .where(counted(window))
    .groupBy(saleItems.variantId, productVariants.sku)
    .orderBy(desc(sql`sum(${saleItems.lineTotal})`), asc(productVariants.sku));
}

/** Lines per current product brand; products without one share a `null` row. */
export async function salesByBrand(window: ReportWindow) {
  return db
    .select({ id: brands.id, name: brands.name, ...lineColumns })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .innerJoin(productVariants, eq(productVariants.id, saleItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(counted(window))
    .groupBy(brands.id, brands.name)
    .orderBy(desc(sql`sum(${saleItems.lineTotal})`), asc(brands.name));
}

/** Sales per cashier. */
export async function salesByEmployee(window: ReportWindow) {
  return db
    .select({
      id: users.id,
      name: users.name,
      count: sql<number>`count(*)`.mapWith(Number),
      grandTotal: num(sql`sum(${sales.grandTotal})`),
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.cashierId))
    .where(counted(window))
    .groupBy(users.id, users.name)
    .orderBy(desc(sql`sum(${sales.grandTotal})`), asc(users.name));
}

/** Voucher uses and discount given per code (FR-RPT-03). */
export async function voucherUsage(window: ReportWindow) {
  return db
    .select({
      code: vouchers.code,
      uses: sql<number>`count(*)`.mapWith(Number),
      discount: num(sql`sum(${sales.voucherDiscount})`),
    })
    .from(sales)
    .innerJoin(vouchers, eq(vouchers.id, sales.voucherId))
    .where(counted(window))
    .groupBy(vouchers.code)
    .orderBy(desc(sql`sum(${sales.voucherDiscount})`), asc(vouchers.code));
}

/** Manual item discounts (FR-RPT-03). */
export async function manualDiscounts(window: ReportWindow) {
  const [row] = await db
    .select({
      lines: sql<number>`count(*)`.mapWith(Number),
      total: num(sql`sum(${saleItems.discountAmount})`),
    })
    .from(saleItems)
    .innerJoin(sales, eq(sales.id, saleItems.saleId))
    .where(and(counted(window), sql`${saleItems.discountAmount} > 0`));
  return { lines: row?.lines ?? 0, total: row?.total ?? 0 };
}

/** PPN and service per rate as charged at the time (FR-RPT-04). */
export async function taxByRate(window: ReportWindow) {
  return db
    .select({
      ppnRateBps: sales.ppnRateBps,
      serviceRateBps: sales.serviceRateBps,
      priceIncludesTax: sales.priceIncludesTax,
      count: sql<number>`count(*)`.mapWith(Number),
      base: num(sql`sum(${sales.grandTotal} - ${sales.ppnAmount} - ${sales.serviceAmount})`),
      service: num(sql`sum(${sales.serviceAmount})`),
      ppn: num(sql`sum(${sales.ppnAmount})`),
    })
    .from(sales)
    .where(counted(window))
    .groupBy(sales.ppnRateBps, sales.serviceRateBps, sales.priceIncludesTax)
    .orderBy(asc(sales.ppnRateBps), asc(sales.serviceRateBps));
}

/** Today's POS figures for the dashboard (FR-DSH-01). */
export async function todayFigures(window: ReportWindow) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      grandTotal: num(sql`sum(${sales.grandTotal})`),
    })
    .from(sales)
    .where(counted(window));
  return { count: row?.count ?? 0, grandTotal: row?.grandTotal ?? 0 };
}

/** Methods whose money lands in the drawer or a bank account (FR-RPT-06). */
const moneyInMethods = ["CASH", "TRANSFER", "QRIS"] as const;

const dayOf = (column: AnyColumn, window: ReportWindow) =>
  sql<string>`to_char((${column} at time zone ${window.timeZone})::date, 'YYYY-MM-DD')`;

const within = (column: AnyColumn, window: ReportWindow) =>
  and(gte(column, window.start), lt(column, window.end));

/**
 * Money received per store day, method, bank account and shift kind
 * (FR-RPT-06, ADR-0032): settled payments of non-voided sales by sale time;
 * cash store credit installments by the time they were taken, as the shift
 * counts them; and transfer or QRIS installments once approved, as in
 * `creditCollected`. The kind tells the drawer from a salesperson's cash;
 * it is null for shifts from before drawer tracking.
 */
export async function moneyInByDay(window: ReportWindow) {
  const columns = {
    method: payments.method,
    bankAccountId: payments.bankAccountId,
    kind: shifts.kind,
    total: num(sql`sum(${payments.amount})`),
  };
  const [fromSales, cashCredit, bankCredit] = await Promise.all([
    db
      .select({ day: dayOf(sales.createdAt, window), ...columns })
      .from(payments)
      .innerJoin(sales, eq(sales.id, payments.saleId))
      .leftJoin(shifts, eq(shifts.id, sales.shiftId))
      .where(
        and(
          counted(window),
          eq(payments.status, "SETTLED"),
          inArray(payments.method, moneyInMethods),
        ),
      )
      .groupBy(sql`1`, payments.method, payments.bankAccountId, shifts.kind),
    db
      .select({ day: dayOf(payments.createdAt, window), ...columns })
      .from(payments)
      .leftJoin(shifts, eq(shifts.id, payments.shiftId))
      .where(
        and(
          isNotNull(payments.kasbonId),
          eq(payments.method, "CASH"),
          ne(payments.status, "FAILED"),
          within(payments.createdAt, window),
        ),
      )
      .groupBy(sql`1`, payments.method, payments.bankAccountId, shifts.kind),
    db
      .select({ day: dayOf(payments.updatedAt, window), ...columns })
      .from(payments)
      .leftJoin(shifts, eq(shifts.id, payments.shiftId))
      .where(
        and(
          isNotNull(payments.kasbonId),
          inArray(payments.method, ["TRANSFER", "QRIS"]),
          eq(payments.status, "SETTLED"),
          within(payments.updatedAt, window),
        ),
      )
      .groupBy(sql`1`, payments.method, payments.bankAccountId, shifts.kind),
  ]);
  return [...fromSales, ...cashCredit, ...bankCredit];
}

/**
 * Drawer movements per store day besides money received (ADR-0032): the
 * float cashiers added when opening, staff expenses paid out, and the
 * variance counted at close. Drawer shifts only.
 */
export async function drawerFlowsByDay(window: ReportWindow) {
  const drawer = eq(shifts.kind, "DRAWER");
  const [added, spent, counted] = await Promise.all([
    db
      .select({ day: dayOf(shifts.openedAt, window), total: num(sql`sum(${shifts.openingCash})`) })
      .from(shifts)
      .where(and(drawer, within(shifts.openedAt, window)))
      .groupBy(sql`1`),
    db
      .select({
        day: dayOf(cashExpenses.createdAt, window),
        total: num(sql`sum(${cashExpenses.amount})`),
      })
      .from(cashExpenses)
      .innerJoin(shifts, eq(shifts.id, cashExpenses.shiftId))
      .where(and(drawer, within(cashExpenses.createdAt, window)))
      .groupBy(sql`1`),
    db
      .select({ day: dayOf(shifts.closedAt, window), total: num(sql`sum(${shifts.variance})`) })
      .from(shifts)
      .where(and(drawer, isNotNull(shifts.closedAt), within(shifts.closedAt, window)))
      .groupBy(sql`1`),
  ]);
  return { added, spent, counted };
}

/** Marketplace orders still counting as sold, per store day. */
export async function onlineByDay(window: ReportWindow) {
  const day = sql<string>`to_char((${onlineOrders.createdAt} at time zone ${window.timeZone})::date, 'YYYY-MM-DD')`;
  return db
    .select({ day, total: num(sql`sum(${onlineOrders.itemsTotal})`) })
    .from(onlineOrders)
    .where(liveOrders(window))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

/** Bank accounts by id, for labelling money received and deposits. */
export async function bankAccountLabels() {
  return db
    .select({
      id: bankAccounts.id,
      bankName: bankAccounts.bankName,
      accountNo: bankAccounts.accountNo,
      isActive: bankAccounts.isActive,
    })
    .from(bankAccounts)
    .orderBy(asc(bankAccounts.bankName), asc(bankAccounts.accountNo));
}

/** Deposits not cancelled, per store day in `[from, to]` (FR-RPT-07). */
export async function depositsByDay(from: string, to: string) {
  return db
    .select({ day: cashDeposits.day, total: num(sql`sum(${cashDeposits.amount})`) })
    .from(cashDeposits)
    .where(
      and(gte(cashDeposits.day, from), lte(cashDeposits.day, to), isNull(cashDeposits.cancelledAt)),
    )
    .groupBy(cashDeposits.day)
    .orderBy(cashDeposits.day);
}

/** Deposits not cancelled on store days before `day`. */
export async function depositsBefore(day: string) {
  const [row] = await db
    .select({ total: num(sql`sum(${cashDeposits.amount})`) })
    .from(cashDeposits)
    .where(and(lt(cashDeposits.day, day), isNull(cashDeposits.cancelledAt)));
  return row?.total ?? 0;
}

/** Deposits of `[from, to]`, cancelled ones included, oldest first. */
export async function listDeposits(from: string, to: string) {
  return db
    .select({
      id: cashDeposits.id,
      day: cashDeposits.day,
      amount: cashDeposits.amount,
      note: cashDeposits.note,
      bankAccountId: cashDeposits.bankAccountId,
      bankName: bankAccounts.bankName,
      accountNo: bankAccounts.accountNo,
      actorName: users.name,
      createdAt: cashDeposits.createdAt,
      cancelledAt: cashDeposits.cancelledAt,
    })
    .from(cashDeposits)
    .innerJoin(bankAccounts, eq(bankAccounts.id, cashDeposits.bankAccountId))
    .innerJoin(users, eq(users.id, cashDeposits.actorId))
    .where(and(gte(cashDeposits.day, from), lte(cashDeposits.day, to)))
    .orderBy(asc(cashDeposits.day), asc(cashDeposits.createdAt));
}
