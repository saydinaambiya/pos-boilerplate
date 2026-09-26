import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { id, timestamps } from "./columns";

/**
 * Owner-managed settings (PRD FR-SET-08): one row per key, the value is
 * validated by the key's Zod schema in `src/lib/settings/schemas.ts`.
 */
export const settings = pgTable(
  "settings",
  {
    id: id(),
    key: text().notNull(),
    value: jsonb().notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("settings_key_key").on(table.key)],
);

/** Destination accounts for bank transfers (FR-SET-05). */
export const bankAccounts = pgTable("bank_accounts", {
  id: id(),
  bankName: text().notNull(),
  accountNo: text().notNull(),
  accountName: text().notNull(),
  isActive: boolean().notNull().default(true),
  ...timestamps,
});

/** Marketplaces that online orders come from (FR-SET-06). */
export const marketplaces = pgTable(
  "marketplaces",
  {
    id: id(),
    name: text().notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("marketplaces_name_key").on(sql`lower(${table.name})`)],
);
