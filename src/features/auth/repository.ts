import "server-only";

import { and, count, eq, isNull, max, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { recoveryCodes, roles, users } from "@/db/schema";

export async function findUserByUsername(username: string) {
  const [user] = await db
    .select({
      id: users.id,
      isActive: users.isActive,
      passwordHash: users.passwordHash,
      pinHash: users.pinHash,
      lockedUntil: users.lockedUntil,
      mustChangePin: users.mustChangePin,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return user;
}

export async function findPinHash(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ pinHash: users.pinHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.pinHash ?? null;
}

/**
 * Counts a failed attempt atomically and locks the account once the limit is
 * reached (FR-AUTH-04). Returns the lock expiry when this attempt locked it.
 */
export async function registerFailedAttempt(
  userId: string,
  maxAttempts: number,
  lockUntil: Date,
): Promise<Date | null> {
  const reachesLimit = sql`${users.failedAttempts} + 1 >= ${maxAttempts}`;
  const [row] = await db
    .update(users)
    .set({
      failedAttempts: sql`CASE WHEN ${reachesLimit} THEN 0 ELSE ${users.failedAttempts} + 1 END`,
      lockedUntil: sql`CASE WHEN ${reachesLimit} THEN ${lockUntil.toISOString()}::timestamptz ELSE ${users.lockedUntil} END`,
    })
    .where(eq(users.id, userId))
    .returning({ lockedUntil: users.lockedUntil });
  return row?.lockedUntil?.getTime() === lockUntil.getTime() ? lockUntil : null;
}

/** Serialises concurrent logins of one account, e.g. for the device limit (FR-AUTH-09). */
export async function lockUser(executor: Executor, userId: string): Promise<void> {
  await executor.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
}

export async function clearFailedAttempts(executor: Executor, userId: string): Promise<void> {
  await executor
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userId));
}

export async function updatePin(
  executor: Executor,
  userId: string,
  pinHash: string,
): Promise<void> {
  await executor
    .update(users)
    .set({ pinHash, mustChangePin: false, failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userId));
}

export async function findPasswordHash(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.passwordHash ?? null;
}

/** A new password also lifts any lockout (FR-AUTH-11/12). */
export async function updatePassword(
  executor: Executor,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await executor
    .update(users)
    .set({ passwordHash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Replaces the user's recovery codes with a new set (ADR-0037). */
export async function replaceRecoveryCodes(
  executor: Executor,
  userId: string,
  codeHashes: readonly string[],
): Promise<void> {
  await executor.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  await executor.insert(recoveryCodes).values(codeHashes.map((codeHash) => ({ userId, codeHash })));
}

/** Marks an unused code of the user as used; false when there is none (ADR-0037). */
export async function useRecoveryCode(
  executor: Executor,
  userId: string,
  codeHash: string,
  now: Date,
): Promise<boolean> {
  const used = await executor
    .update(recoveryCodes)
    .set({ usedAt: now, updatedAt: now })
    .where(
      and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, codeHash),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .returning({ id: recoveryCodes.id });
  return used.length > 0;
}

/** How many codes the user has, how many are unused, and when they were made. */
export async function recoveryCodeCounts(executor: Executor, userId: string) {
  const [row] = await executor
    .select({
      total: count(),
      unused: sql<number>`count(*) filter (where ${recoveryCodes.usedAt} is null)`.mapWith(Number),
      createdAt: max(recoveryCodes.createdAt),
    })
    .from(recoveryCodes)
    .where(eq(recoveryCodes.userId, userId));
  return { total: row?.total ?? 0, unused: row?.unused ?? 0, createdAt: row?.createdAt ?? null };
}

/** The Owner account, found by its system role (BR-01). */
export async function findOwner(executor: Executor) {
  const [row] = await executor
    .select({ id: users.id, username: users.username })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(roles.isSystem, true))
    .limit(1);
  return row;
}
