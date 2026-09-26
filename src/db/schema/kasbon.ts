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

import { id, timestamps, timestamptz } from "./columns";
import { sales } from "./sales";

const money = () => bigint({ mode: "number" });

/** Store-credit customers, re-selectable by phone (FR-KSB-01, BR-11). */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text().notNull(),
    /** Normalised to `+62…`. */
    phone: text().notNull(),
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
 * Store credit from a sale's unpaid remainder (PRD §3.8, §4.3). `paid_total`
 * only counts approved payments; `balance = total − paid_total`
 * (FR-KSB-02).
 */
export const kasbons = pgTable(
  "kasbons",
  {
    id: id(),
    saleId: uuid()
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    total: money().notNull(),
    paidTotal: money().notNull().default(0),
    balance: money().notNull(),
    dueDate: date({ mode: "string" }),
    status: kasbonStatus().notNull().default("OPEN"),
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
  ],
);
