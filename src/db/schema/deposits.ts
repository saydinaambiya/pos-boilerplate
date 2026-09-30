import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./access";
import { id, timestamps, timestamptz } from "./columns";
import { shifts } from "./sales";
import { bankAccounts } from "./settings";

/**
 * Drawer cash paid into a bank account at an ATM (FR-RPT-07, ADR-0032).
 * Only what the machine accepted is recorded; rejected notes stay in the
 * drawer and carry over to the next day. A mistake is corrected in place
 * or cancelled, always with a reason kept in `cash_deposit_revisions`.
 *
 * `shift_id` is the drawer shift the cash left: the open one, which expects
 * less cash at close, or else the last closed one, whose leftover for the
 * next shift drops.
 */
export const cashDeposits = pgTable(
  "cash_deposits",
  {
    id: id(),
    /** Store day the money left the drawer. */
    day: date({ mode: "string" }).notNull(),
    bankAccountId: uuid()
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    amount: bigint({ mode: "number" }).notNull(),
    note: text(),
    shiftId: uuid().references(() => shifts.id, { onDelete: "restrict" }),
    /** Taken after `shift_id` closed, so it lowers that shift's leftover, not its expected cash. */
    afterClose: boolean().notNull().default(false),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cancelledAt: timestamptz(),
    cancelledById: uuid().references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    index("cash_deposits_day_idx").on(table.day),
    index("cash_deposits_shift_id_idx").on(table.shiftId),
    check("cash_deposits_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const depositRevisionKinds = ["EDITED", "CANCELLED"] as const;
export const depositRevisionKind = pgEnum("deposit_revision_kind", depositRevisionKinds);

/** The fields of a deposit a revision records before and after the change. */
export interface DepositSnapshot {
  day: string;
  bankAccountId: string;
  amount: number;
  note: string | null;
}

/**
 * Every correction of a deposit, oldest first (FR-RPT-07, ADR-0032): what
 * changed, why, who and when. A deposit is edited in place rather than
 * cancelled and recorded again, so it never looks deposited twice.
 */
export const cashDepositRevisions = pgTable(
  "cash_deposit_revisions",
  {
    id: id(),
    depositId: uuid()
      .notNull()
      .references(() => cashDeposits.id, { onDelete: "restrict" }),
    kind: depositRevisionKind().notNull(),
    before: jsonb().$type<DepositSnapshot>().notNull(),
    after: jsonb().$type<DepositSnapshot>(),
    reason: text().notNull(),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [index("cash_deposit_revisions_deposit_id_idx").on(table.depositId, table.createdAt)],
);
