import { sql } from "drizzle-orm";
import { bigint, check, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { users } from "./access";
import { id, timestamps } from "./columns";
import { shifts } from "./sales";

/** Kinds of daily staff expense; fixed in code, `OTHER` needs a note (FR-EXP-01, ADR-0027). */
export const expenseCategories = ["MEAL", "FUEL", "DONATION", "OTHER"] as const;
export const expenseCategory = pgEnum("expense_category", expenseCategories);

/**
 * Money paid out of the cash drawer during a shift, such as a meal or
 * fuel allowance or a donation (FR-EXP-01..03). It lowers the shift's
 * expected cash and shows in the daily recap. Rows are never edited.
 */
export const cashExpenses = pgTable(
  "cash_expenses",
  {
    id: id(),
    shiftId: uuid()
      .notNull()
      .references(() => shifts.id, { onDelete: "restrict" }),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Employee who received the money; optional for donations and other expenses. */
    recipientId: uuid().references(() => users.id, { onDelete: "restrict" }),
    category: expenseCategory().notNull(),
    amount: bigint({ mode: "number" }).notNull(),
    note: text(),
    ...timestamps,
  },
  (table) => [
    index("cash_expenses_shift_id_idx").on(table.shiftId),
    index("cash_expenses_created_at_idx").on(table.createdAt),
    check("cash_expenses_amount_positive", sql`${table.amount} > 0`),
  ],
);
