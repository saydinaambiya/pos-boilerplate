import "server-only";

import { eq, sql } from "drizzle-orm";

import {
  DEFAULT_EMPLOYEE_ROLE,
  OWNER_ROLE_NAME,
  type Permission,
  SEEDED_ROLES,
} from "@/config/permissions";
import { hashSecret, passwordSchema, pinSchema } from "@/lib/auth/credentials";

import type { Database, Executor } from "./client";
import { rolePermissions, roles, users } from "./schema";

export interface SeedOptions {
  owner: { username: string; name: string; password: string };
  /** Test fixtures: created or reset to the given PIN on every run. */
  employees?: { username: string; name: string; pin: string; mustChangePin: boolean }[];
}

async function ensureRole(
  executor: Executor,
  name: string,
  isSystem: boolean,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await executor
    .select({ id: roles.id })
    .from(roles)
    .where(eq(sql`lower(${roles.name})`, name.toLowerCase()))
    .limit(1);
  if (existing) return { id: existing.id, created: false };
  const [created] = await executor
    .insert(roles)
    .values({ name, isSystem })
    .returning({ id: roles.id });
  if (!created) throw new Error(`Could not create role ${name}`);
  return { id: created.id, created: true };
}

/**
 * Idempotent bootstrap: the Owner system role, the default employee role
 * and the salespeople roles with their starter permissions (ADR-0024), and
 * the single owner account (BR-01, PRD §2.2). Existing roles and an
 * existing owner are never overwritten.
 */
export async function seed(database: Database, options: SeedOptions): Promise<void> {
  const password = passwordSchema.parse(options.owner.password);
  const ownerHash = await hashSecret(password);
  const employeeHashes = await Promise.all(
    (options.employees ?? []).map(async (employee) => ({
      ...employee,
      pinHash: await hashSecret(pinSchema.parse(employee.pin)),
    })),
  );

  await database.transaction(async (tx) => {
    const owner = await ensureRole(tx, OWNER_ROLE_NAME, true);
    const employee = await ensureRole(tx, DEFAULT_EMPLOYEE_ROLE.name, false);
    const starters: {
      role: { id: string; created: boolean };
      permissions: readonly Permission[];
    }[] = [{ role: employee, permissions: DEFAULT_EMPLOYEE_ROLE.permissions }];
    for (const seeded of SEEDED_ROLES) {
      starters.push({
        role: await ensureRole(tx, seeded.name, false),
        permissions: seeded.permissions,
      });
    }
    for (const { role, permissions } of starters) {
      if (!role.created) continue;
      await tx
        .insert(rolePermissions)
        .values(permissions.map((permission) => ({ roleId: role.id, permission })));
    }

    const [existingOwner] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.roleId, owner.id))
      .limit(1);
    if (!existingOwner) {
      await tx.insert(users).values({
        username: options.owner.username.toLowerCase(),
        name: options.owner.name,
        roleId: owner.id,
        passwordHash: ownerHash,
      });
    }

    for (const fixture of employeeHashes) {
      const values = {
        name: fixture.name,
        roleId: employee.id,
        pinHash: fixture.pinHash,
        passwordHash: null,
        mustChangePin: fixture.mustChangePin,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
      };
      await tx
        .insert(users)
        .values({ username: fixture.username.toLowerCase(), ...values })
        .onConflictDoUpdate({ target: users.username, set: values });
    }
  });
}
