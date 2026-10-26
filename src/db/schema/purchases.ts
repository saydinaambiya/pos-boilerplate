import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./access";
import { id, timestamps, timestamptz } from "./columns";

const money = () => bigint({ mode: "number" });

/** Housekeeping markers on transactional tables (PRD §11, BR-18). */
const archival = {
  archivedAt: timestamptz(),
  archiveBatchId: uuid(),
};

export const purchaseStatuses = ["OPEN", "PARTIALLY_PAID", "SETTLED"] as const;
export const purchaseStatus = pgEnum("purchase_status", purchaseStatuses);

/** How a supplier installment was paid; informational, off the cash drawer (FR-PRB-03). */
export const purchasePayMethods = ["CASH", "TRANSFER"] as const;
export const purchasePayMethod = pgEnum("purchase_pay_method", purchasePayMethods);

/**
 * Supplier bills (nota pembelian) the store records itself (PRD §3.18). It
 * carries no goods and never moves stock (FR-PRB-01); it is the accounts
 * payable side of the ledger, mirroring store credit on the receivable side.
 * `paid_total` only counts recorded installments, `balance = total − paid_total`
 * (FR-PRB-02/03). Dates are free so an older bill can be entered by hand
 * (FR-PRB-05).
 */
export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    /** Supplier, typed free (FR-PRB-01). */
    companyName: text().notNull(),
    /** Nota faktur number from the supplier (FR-PRB-01). */
    invoiceNo: text().notNull(),
    total: money().notNull(),
    paidTotal: money().notNull().default(0),
    balance: money().notNull(),
    status: purchaseStatus().notNull().default("OPEN"),
    /** Tanggal PO; nothing restricts it, so a bill can be backdated (FR-PRB-05). */
    orderDate: date({ mode: "string" }).notNull(),
    /** Tanggal jatuh tempo; only a credit bill has one (FR-PRB-02). */
    dueDate: date({ mode: "string" }),
    note: text(),
    /** Who recorded it (FR-PRB-07). */
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    ...archival,
    ...timestamps,
  },
  (table) => [
    uniqueIndex("purchases_company_invoice_key").on(
      sql`lower(${table.companyName})`,
      table.invoiceNo,
    ),
    index("purchases_status_order_date_idx").on(table.status, table.orderDate),
    index("purchases_due_date_idx").on(table.dueDate),
    check(
      "purchases_amounts_consistent",
      sql`${table.balance} = ${table.total} - ${table.paidTotal} AND ${table.balance} >= 0`,
    ),
    check(
      "purchases_due_after_order",
      sql`${table.dueDate} IS NULL OR ${table.dueDate} >= ${table.orderDate}`,
    ),
  ],
);

/**
 * Installments and payoffs of a supplier bill (FR-PRB-03). They never touch
 * the cash drawer, shifts or reports (FR-PRB-06, ADR-0053), so they live in
 * their own table rather than `payments`.
 */
export const purchasePayments = pgTable(
  "purchase_payments",
  {
    id: id(),
    purchaseId: uuid()
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    amount: money().notNull(),
    /** When it was paid; backdatable like the bill (FR-PRB-05). */
    paidOn: date({ mode: "string" }).notNull(),
    method: purchasePayMethod().notNull(),
    note: text(),
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("purchase_payments_purchase_id_idx").on(table.purchaseId, table.paidOn),
    check("purchase_payments_amount_positive", sql`${table.amount} > 0`),
  ],
);
