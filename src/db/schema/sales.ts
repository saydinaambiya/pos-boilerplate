import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./access";
import { productVariants } from "./catalog";
import { id, timestamps, timestamptz } from "./columns";
import { bankAccounts } from "./settings";
import { customers, kasbons } from "./kasbon";
import { vouchers } from "./vouchers";

const money = () => bigint({ mode: "number" });

/** Housekeeping markers on transactional tables (PRD §11, BR-18). */
const archival = {
  archivedAt: timestamptz(),
  archiveBatchId: uuid(),
};

/**
 * Cashier shifts (FR-SHF-01..04). At most one open shift per user, enforced
 * by a partial unique index.
 */
export const shifts = pgTable(
  "shifts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    openedAt: timestamptz().notNull().defaultNow(),
    openingCash: money().notNull(),
    closedAt: timestamptz(),
    expectedCash: money(),
    countedCash: money(),
    variance: money(),
    note: text(),
    ...archival,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("shifts_one_open_per_user_key")
      .on(table.userId)
      .where(sql`${table.closedAt} IS NULL`),
    index("shifts_user_id_opened_at_idx").on(table.userId, table.openedAt),
    index("shifts_opened_at_idx").on(table.openedAt),
    check("shifts_opening_cash_non_negative", sql`${table.openingCash} >= 0`),
  ],
);

export const saleStatuses = ["COMPLETED", "COMPLETED_WITH_KASBON", "VOIDED"] as const;
export const saleStatus = pgEnum("sale_status", saleStatuses);

/**
 * Completed sales (PRD §4.1). Totals and tax configuration are snapshotted
 * so later setting changes never alter past sales (PRD §5).
 */
export const sales = pgTable(
  "sales",
  {
    id: id(),
    invoiceNo: text().notNull(),
    shiftId: uuid()
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    cashierId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    customerId: uuid().references(() => customers.id, { onDelete: "restrict" }),
    status: saleStatus().notNull(),
    subtotal: money().notNull(),
    itemDiscountTotal: money().notNull(),
    voucherId: uuid().references(() => vouchers.id, { onDelete: "restrict" }),
    voucherDiscount: money().notNull().default(0),
    serviceRateBps: integer().notNull(),
    serviceAmount: money().notNull(),
    ppnRateBps: integer().notNull(),
    ppnAmount: money().notNull(),
    priceIncludesTax: boolean().notNull(),
    grandTotal: money().notNull(),
    paidTotal: money().notNull(),
    idempotencyKey: text().notNull(),
    ...archival,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sales_invoice_no_key").on(table.invoiceNo),
    uniqueIndex("sales_cashier_idempotency_key").on(table.cashierId, table.idempotencyKey),
    index("sales_shift_id_idx").on(table.shiftId),
    index("sales_created_at_idx").on(table.createdAt),
    index("sales_status_created_at_idx").on(table.status, table.createdAt),
    index("sales_voucher_id_idx").on(table.voucherId),
  ],
);

export const discountTypes = ["percent", "amount"] as const;
export const discountType = pgEnum("discount_type", discountTypes);

/** Sale lines with product/variant names frozen at sale time (FR-INV-04). */
export const saleItems = pgTable(
  "sale_items",
  {
    id: id(),
    saleId: uuid()
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    nameSnapshot: text().notNull(),
    variantSnapshot: text(),
    unitPrice: money().notNull(),
    /** Cost at sale time, for gross profit (FR-RPT-02); visible only with `report:view-profit`. */
    unitCost: money().notNull().default(0),
    qty: integer().notNull(),
    discountType: discountType(),
    discountValue: bigint({ mode: "number" }),
    discountAmount: money().notNull().default(0),
    lineTotal: money().notNull(),
    sortOrder: integer().notNull().default(0),
    ...archival,
    ...timestamps,
  },
  (table) => [
    index("sale_items_sale_id_idx").on(table.saleId, table.sortOrder),
    index("sale_items_variant_id_idx").on(table.variantId),
    check("sale_items_qty_positive", sql`${table.qty} > 0`),
  ],
);

export const paymentMethods = ["CASH", "TRANSFER", "MARKETPLACE", "KASBON"] as const;
export const paymentMethod = pgEnum("payment_method", paymentMethods);

export const paymentStatuses = ["SETTLED", "PENDING", "FAILED"] as const;
export const paymentStatus = pgEnum("payment_status", paymentStatuses);

/**
 * Payments (FR-PAY-01..06). `amount` is what was allocated to the bill;
 * cash tendered and change are never stored (BR-22, FR-PAY-03).
 */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    saleId: uuid().references(() => sales.id, { onDelete: "restrict" }),
    kasbonId: uuid().references(() => kasbons.id, { onDelete: "restrict" }),
    /**
     * Groups the cash and transfer parts of one store credit installment,
     * which are approved together (FR-KSB-03, ADR-0012).
     */
    installmentId: uuid(),
    /** Shift where a store-credit payment was taken; sale payments use the sale's shift. */
    shiftId: uuid().references(() => shifts.id, { onDelete: "restrict" }),
    method: paymentMethod().notNull(),
    amount: money().notNull(),
    bankAccountId: uuid().references(() => bankAccounts.id, { onDelete: "restrict" }),
    reference: text(),
    status: paymentStatus().notNull().default("SETTLED"),
    providerPayload: jsonb(),
    ...archival,
    ...timestamps,
  },
  (table) => [
    index("payments_sale_id_idx").on(table.saleId),
    index("payments_method_created_at_idx").on(table.method, table.createdAt),
    index("payments_kasbon_id_idx").on(table.kasbonId),
    index("payments_installment_id_idx").on(table.installmentId),
    index("payments_shift_id_idx").on(table.shiftId),
    check("payments_amount_positive", sql`${table.amount} > 0`),
  ],
);

/** Gap-free daily invoice sequence, incremented in the checkout transaction (FR-POS-07). */
export const invoiceCounters = pgTable("invoice_counters", {
  id: id(),
  date: text().notNull().unique(),
  lastSeq: integer().notNull().default(0),
  ...timestamps,
});

/** Replay protection for checkout and payment requests, kept 24 h (FR-POS-08, PRD §8.2). */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: id(),
    key: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestHash: text().notNull(),
    response: jsonb().notNull(),
    expiresAt: timestamptz().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idempotency_keys_user_key").on(table.userId, table.key),
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
  ],
);
