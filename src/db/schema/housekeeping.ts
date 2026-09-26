import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./access";
import { id, timestamps, timestamptz } from "./columns";

/**
 * One housekeeping batch per store month (FR-HK-03, FR-HK-07): what was
 * last exported (row counts and SHA-256 per CSV file, by whom, when) and,
 * once marked, who marked the rows as archived.
 */
export const archiveBatches = pgTable(
  "archive_batches",
  {
    id: id(),
    /** Store-local month, `YYYY-MM`. */
    month: text().notNull(),
    rowCounts: jsonb().$type<Record<string, number>>().notNull(),
    checksums: jsonb().$type<Record<string, string>>().notNull(),
    exportedAt: timestamptz().notNull(),
    exportedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamptz(),
    archivedBy: uuid().references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("archive_batches_month_key").on(table.month)],
);
