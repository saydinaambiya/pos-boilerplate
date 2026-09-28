import "server-only";

import { db } from "@/db/client";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { readSetting } from "@/lib/settings/store";

import { deleteUserSession, findAccountRole, listActiveSessions } from "./repository";
import { describeUserAgent } from "./user-agent";

export type EndDeviceResult =
  { ok: true } | { ok: false; reason: "not-found" | "current" | "owner-protected" };

async function devicesOf(userId: string, currentSessionId: string | null, now: Date) {
  const [rows, operations] = await Promise.all([
    listActiveSessions(userId, now),
    readSetting("operations"),
  ]);
  return {
    maxDevices: operations.maxDevicesPerUser,
    devices: rows.map((row) => ({
      id: row.id,
      signedInAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      ip: row.ip,
      current: row.id === currentSessionId,
      ...describeUserAgent(row.userAgent),
    })),
  };
}

/** The viewer's own signed-in devices and the limit (FR-AUTH-09/10). */
export async function getMyDevices(session: Session, now = new Date()) {
  return devicesOf(session.user.id, session.id, now);
}

/**
 * Devices of another account, for `employee:manage` (FR-AUTH-10). The
 * Owner's devices are only listed to the Owner.
 */
export async function getUserDevices(session: Session, userId: string, now = new Date()) {
  assertPermission(session, "employee:manage");
  const account = await findAccountRole(userId);
  if (!account || (account.isOwner && !session.role.isSystem)) return undefined;
  return devicesOf(userId, userId === session.user.id ? session.id : null, now);
}

async function endDevice(
  session: Session,
  userId: string,
  sessionId: string,
  context: RequestContext,
): Promise<EndDeviceResult> {
  if (sessionId === session.id) return { ok: false, reason: "current" };
  return db.transaction(async (tx) => {
    const deleted = await deleteUserSession(tx, userId, sessionId, session.id);
    if (!deleted) return { ok: false, reason: "not-found" } as const;
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "auth.session.ended",
        entity: "user",
        entityId: userId,
        diff: { sessionId },
      },
      context,
    );
    return { ok: true } as const;
  });
}

/** Signs one of the viewer's other devices out (FR-AUTH-10). */
export async function endMyDevice(
  session: Session,
  sessionId: string,
  context: RequestContext,
): Promise<EndDeviceResult> {
  return endDevice(session, session.user.id, sessionId, context);
}

/**
 * Forces a device of another account to sign out, e.g. to free a slot
 * under the device limit (FR-AUTH-09/10). Needs `employee:manage`; only the
 * Owner may end the Owner's own devices.
 */
export async function endUserDevice(
  session: Session,
  userId: string,
  sessionId: string,
  context: RequestContext,
): Promise<EndDeviceResult> {
  assertPermission(session, "employee:manage");
  const account = await findAccountRole(userId);
  if (!account) return { ok: false, reason: "not-found" };
  if (account.isOwner && !session.role.isSystem) return { ok: false, reason: "owner-protected" };
  return endDevice(session, userId, sessionId, context);
}
