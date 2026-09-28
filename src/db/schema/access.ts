import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps, timestamptz } from "./columns";

/** Roles (PRD §2.2, FR-RBAC-01). `is_system` marks the immutable Owner role. */
export const roles = pgTable(
  "roles",
  {
    id: id(),
    name: text().notNull(),
    isSystem: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("roles_name_key").on(sql`lower(${table.name})`)],
);

/** Role → permission mapping; values come from `src/config/permissions.ts`. */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: id(),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("role_permissions_role_permission_key").on(table.roleId, table.permission),
  ],
);

/**
 * Accounts (PRD §2.1, §11). Owners authenticate with a password, employees
 * with a PIN; exactly one of the two hashes is set.
 */
export const users = pgTable(
  "users",
  {
    id: id(),
    username: text().notNull(),
    name: text().notNull(),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    passwordHash: text(),
    pinHash: text(),
    isActive: boolean().notNull().default(true),
    locale: text(),
    theme: text(),
    failedAttempts: integer().notNull().default(0),
    lockedUntil: timestamptz(),
    mustChangePin: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_username_key").on(table.username),
    index("users_role_id_idx").on(table.roleId),
    check(
      "users_one_credential",
      sql`(${table.passwordHash} IS NULL) <> (${table.pinHash} IS NULL)`,
    ),
    check("users_username_lowercase", sql`${table.username} = lower(${table.username})`),
  ],
);

/**
 * Server-side sessions; only the SHA-256 of the cookie token is stored
 * (ADR-0006). Each one is a signed-in device, capped per user (FR-AUTH-09).
 */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    /** Last request, refreshed together with the sliding expiry (FR-AUTH-10). */
    lastSeenAt: timestamptz().notNull().defaultNow(),
    ip: text(),
    userAgent: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_hash_key").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);
