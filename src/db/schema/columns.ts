import { timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/** UUIDv7 primary key: time-ordered, so inserts stay index-friendly (PRD §11). */
export const id = () => uuid().primaryKey().$defaultFn(uuidv7);

export const timestamptz = () => timestamp({ withTimezone: true, mode: "date" });

/** `created_at` / `updated_at` present on every table (PRD §11). */
export const timestamps = {
  createdAt: timestamptz().notNull().defaultNow(),
  updatedAt: timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
