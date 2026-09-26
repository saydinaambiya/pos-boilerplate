import "server-only";

import { and, eq, gt, lt, ne } from "drizzle-orm";

import { isPermission, type Permission, permissions } from "@/config/permissions";
import { db, type Executor } from "@/db/client";
import { rolePermissions, roles, sessions, users } from "@/db/schema";
import type { RequestContext } from "@/lib/http/request-context";

import { authPolicy } from "./policy";
import { createSessionToken, hashSessionToken } from "./session-token";

export interface Session {
  id: string;
  expiresAt: Date;
  user: {
    id: string;
    username: string;
    name: string;
    credential: "password" | "pin";
    mustChangePin: boolean;
  };
  role: { id: string; name: string; isSystem: boolean };
  /** Resolved on every request, so role edits apply without re-login (FR-RBAC-03). */
  permissions: ReadonlySet<Permission>;
}

const MINUTE_MS = 60_000;

function idleExpiry(now: Date): Date {
  return new Date(now.getTime() + authPolicy.sessionIdleMinutes * MINUTE_MS);
}

/** Persists a new session and returns the raw token for the cookie (ADR-0006). */
export async function createSession(
  executor: Executor,
  userId: string,
  context: Pick<RequestContext, "ip" | "userAgent">,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = createSessionToken();
  const expiresAt = idleExpiry(now);
  await executor.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    ip: context.ip,
    userAgent: context.userAgent,
  });
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<{ userId: string } | undefined> {
  const [deleted] = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .returning({ userId: sessions.userId });
  return deleted;
}

/** Ends every other session of a user, e.g. after a credential change. */
export async function deleteOtherSessions(
  executor: Executor,
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await executor
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

/**
 * Resolves a cookie token to a live session with fresh permissions, and
 * slides the idle expiry forward (FR-AUTH-05). Inactive users and inactive
 * roles lose access immediately.
 */
export async function validateSessionToken(
  token: string,
  now = new Date(),
): Promise<Session | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      username: users.username,
      name: users.name,
      passwordHash: users.passwordHash,
      mustChangePin: users.mustChangePin,
      userActive: users.isActive,
      roleId: roles.id,
      roleName: roles.name,
      roleSystem: roles.isSystem,
      roleActive: roles.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!row?.userActive) return null;

  let granted: Permission[] = [];
  if (row.roleSystem) {
    granted = [...permissions];
  } else if (row.roleActive) {
    const rows = await db
      .select({ permission: rolePermissions.permission })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, row.roleId));
    granted = rows.map((entry) => entry.permission).filter(isPermission);
  }

  let expiresAt = row.expiresAt;
  const refreshAfter = idleExpiry(now).getTime() - authPolicy.sessionRefreshMinutes * MINUTE_MS;
  if (expiresAt.getTime() < refreshAfter) {
    expiresAt = idleExpiry(now);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.sessionId));
  }

  return {
    id: row.sessionId,
    expiresAt,
    user: {
      id: row.userId,
      username: row.username,
      name: row.name,
      credential: row.passwordHash === null ? "pin" : "password",
      mustChangePin: row.mustChangePin,
    },
    role: { id: row.roleId, name: row.roleName, isSystem: row.roleSystem },
    permissions: new Set(granted),
  };
}

/** Removes expired sessions; called opportunistically on login. */
export async function purgeExpiredSessions(executor: Executor, now = new Date()): Promise<void> {
  await executor.delete(sessions).where(lt(sessions.expiresAt, now));
}
