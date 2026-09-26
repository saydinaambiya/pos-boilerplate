import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { users } from "./access";
import { id, timestamps } from "./columns";

/** Append-only audit trail (PRD FR-AUD-01..04). No code path updates or deletes rows. */
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
