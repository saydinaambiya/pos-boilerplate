import "server-only";

import { and, desc, eq, gt, ne } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { roles, sessions, users } from "@/db/schema";

/** Signed-in devices of a user, most recently active first (FR-AUTH-10). */
export async function listActiveSessions(userId: string, now: Date) {
  return db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
    .orderBy(desc(sessions.lastSeenAt), desc(sessions.id));
}

/**
 * Deletes one session of a user; returns false when it does not exist or
 * belongs to someone else (NFR-SEC-07). `keepSessionId` protects the
 * caller's own device, which signs out through logout instead.
 */
export async function deleteUserSession(
  executor: Executor,
  userId: string,
  sessionId: string,
  keepSessionId: string,
): Promise<boolean> {
  const deleted = await executor
    .delete(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.userId, userId), ne(sessions.id, keepSessionId)),
    )
    .returning({ id: sessions.id });
  return deleted.length > 0;
}

/** Whether the account exists and holds the Owner role. */
export async function findAccountRole(userId: string) {
  const [row] = await db
    .select({ isOwner: roles.isSystem })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}
