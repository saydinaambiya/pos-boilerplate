import { date, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { users } from "./access";
import { id, timestamps, timestamptz } from "./columns";

/**
 * Audit trail (PRD FR-AUD-01..05). No code path updates rows; the only
 * delete is the Owner's purge of a past date range after its CSV export
 * (FR-AUD-05, ADR-0039).
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid().references(() => users.id, { onDelete: "restrict" }),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    diff: jsonb(),
    ip: text(),
    userAgent: text(),
    requestId: text(),
    ...timestamps,
  },
  (table) => [
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_actor_id_created_at_idx").on(table.actorId, table.createdAt),
    index("audit_logs_action_created_at_idx").on(table.action, table.createdAt),
  ],
);

/**
 * One CSV export of a past date range of the audit log (FR-AUD-05): the
 * store-local days, row count and SHA-256 of the file, who exported it and,
 * once the range is deleted, who deleted it.
 */
export const auditPurges = pgTable("audit_purges", {
  id: id(),
  fromDate: date({ mode: "string" }).notNull(),
  toDate: date({ mode: "string" }).notNull(),
  rowCount: integer().notNull(),
  checksum: text().notNull(),
  exportedAt: timestamptz().notNull(),
  exportedBy: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  purgedAt: timestamptz(),
  purgedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
  ...timestamps,
});
