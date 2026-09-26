import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { users } from "./access";
import { id, timestamps, timestamptz } from "./columns";

const money = () => bigint({ mode: "number" });

export const voucherStatuses = ["PENDING_APPROVAL", "ACTIVE", "INACTIVE", "REJECTED"] as const;
export const voucherStatus = pgEnum("voucher_status", voucherStatuses);

export const voucherTypes = ["PERCENT", "FIXED"] as const;
export const voucherType = pgEnum("voucher_type", voucherTypes);

export const revisionStatuses = ["PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"] as const;
export const revisionStatus = pgEnum("voucher_revision_status", revisionStatuses);

/**
 * Vouchers (PRD §3.9, §4.4). The terms live in revisions; `active_revision_id`
 * points at the approved one, which keeps applying while a newer revision
 * waits for approval (FR-VCH-03). `usage_count` is incremented atomically at
 * checkout against the active revision's quota.
 */
export const vouchers = pgTable(
  "vouchers",
  {
    id: id(),
    code: text().notNull(),
    status: voucherStatus().notNull().default("PENDING_APPROVAL"),
    activeRevisionId: uuid().references((): AnyPgColumn => voucherRevisions.id, {
      onDelete: "restrict",
    }),
    usageCount: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("vouchers_code_key").on(table.code),
    check("vouchers_code_uppercase", sql`${table.code} = upper(${table.code})`),
    check("vouchers_usage_non_negative", sql`${table.usageCount} >= 0`),
  ],
);

/**
 * Voucher terms (FR-VCH-01). `value` is basis points for `PERCENT`
 * (1–100 % → 100–10 000) and rupiah for `FIXED`.
 */
export const voucherRevisions = pgTable(
  "voucher_revisions",
  {
    id: id(),
    voucherId: uuid()
      .notNull()
      .references(() => vouchers.id, { onDelete: "restrict" }),
    name: text().notNull(),
    type: voucherType().notNull(),
    value: money().notNull(),
    minPurchase: money(),
    maxDiscount: money(),
    startsAt: timestamptz(),
    endsAt: timestamptz(),
    quota: integer(),
    status: revisionStatus().notNull().default("PENDING_APPROVAL"),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("voucher_revisions_voucher_id_idx").on(table.voucherId, table.createdAt),
    check("voucher_revisions_value_positive", sql`${table.value} > 0`),
    check(
      "voucher_revisions_period_order",
      sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.startsAt} < ${table.endsAt}`,
    ),
  ],
);
