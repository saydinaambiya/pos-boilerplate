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
import { sales } from "./sales";

const money = () => bigint({ mode: "number" });

/**
 * Store-credit customers, re-selectable by phone when one is given
 * (FR-KSB-01, BR-11, ADR-0047).
 */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text().notNull(),
    /** Normalised to `+62…`; null when the buyer gave none. */
    phone: text(),
    note: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customers_phone_key").on(table.phone),
    index("customers_name_idx").on(sql`lower(${table.name})`),
  ],
);

export const kasbonStatuses = ["OPEN", "PARTIALLY_PAID", "SETTLED"] as const;
export const kasbonStatus = pgEnum("kasbon_status", kasbonStatuses);

/**
 * Store credit from a sale's unpaid remainder (PRD §3.8, §4.3), or an older
 * one entered by hand without a sale (FR-KSB-08, ADR-0052). `paid_total`
 * only counts approved payments; `balance = total − paid_total`
 * (FR-KSB-02).
 */
export const kasbons = pgTable(
  "kasbons",
  {
    id: id(),
    saleId: uuid().references(() => sales.id, { onDelete: "restrict" }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    total: money().notNull(),
    paidTotal: money().notNull().default(0),
    balance: money().notNull(),
    dueDate: date({ mode: "string" }),
    status: kasbonStatus().notNull().default("OPEN"),
    /** Store date the credit was given, on one entered by hand (FR-KSB-08). */
    openedOn: date({ mode: "string" }),
    /** Number on the old paper note, on one entered by hand (FR-KSB-08). */
    reference: text(),
    /** What was taken on credit, on one entered by hand (FR-KSB-08). */
    description: text(),
    /** Who entered it by hand (FR-KSB-08). */
    createdBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamptz(),
    archiveBatchId: uuid(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("kasbons_sale_id_key").on(table.saleId),
    index("kasbons_customer_id_idx").on(table.customerId),
    index("kasbons_status_created_at_idx").on(table.status, table.createdAt),
    check(
      "kasbons_amounts_consistent",
      sql`${table.balance} = ${table.total} - ${table.paidTotal} AND ${table.balance} >= 0`,
    ),
    check(
      "kasbons_sale_or_manual",
      sql`${table.saleId} IS NOT NULL OR (${table.openedOn} IS NOT NULL AND ${table.createdBy} IS NOT NULL)`,
    ),
  ],
);
