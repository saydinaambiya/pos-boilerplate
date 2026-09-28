import "server-only";

import { eq, sql } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { users } from "@/db/schema";

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
