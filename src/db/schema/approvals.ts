import { sql } from "drizzle-orm";
import {
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
import { id, timestamps, timestamptz } from "./columns";

export const approvalTypes = ["VOID", "VOUCHER", "KASBON_PAYMENT"] as const;
export const approvalType = pgEnum("approval_type", approvalTypes);

export const approvalStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const approvalStatus = pgEnum("approval_status", approvalStatuses);

/**
 * One approval mechanism shared by void, vouchers and store-credit payments
 * (PRD §3.10, FR-APR-01..05). `payload` is a snapshot of what was requested;
 * `version` guards decisions against double submission (FR-APR-05).
 */
export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    type: approvalType().notNull(),
    targetType: text().notNull(),
    targetId: uuid().notNull(),
    payload: jsonb().notNull(),
    requestedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: approvalStatus().notNull().default("PENDING"),
    decidedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    decidedAt: timestamptz(),
    note: text(),
    version: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("approvals_status_type_created_at_idx").on(table.status, table.type, table.createdAt),
    index("approvals_requested_by_idx").on(table.requestedBy, table.createdAt),
    index("approvals_target_idx").on(table.targetType, table.targetId),
    uniqueIndex("approvals_one_pending_per_target_key")
      .on(table.type, table.targetId)
      .where(sql`${table.status} = 'PENDING'`),
  ],
);
