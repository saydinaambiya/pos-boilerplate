import "server-only";

import { db } from "@/db/client";
import { recordAudit } from "@/lib/audit/audit";
import { hashSecret, verifyAgainstDummy, verifySecret } from "@/lib/auth/credentials";
import { authPolicy } from "@/lib/auth/policy";
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
  purgeExpiredSessions,
  type Session,
} from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { failureCounter } from "@/lib/security/rate-limit";

import {
  clearFailedAttempts,
  findPinHash,
  findUserByUsername,
  registerFailedAttempt,
  updatePin,
} from "./repository";
import { type ChangePinInput, type LoginInput, usernameSchema } from "./schemas";

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; mustChangePin: boolean }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked" | "rate-limited"; retryAfterSeconds: number };

const MINUTE_MS = 60_000;

function secondsUntil(date: Date, now: Date): number {
  return Math.max(Math.ceil((date.getTime() - now.getTime()) / 1000), 1);
}

async function ipFailures(key: string | null) {
  if (!key) return { count: 0, resetSeconds: 0 };
  try {
    return await failureCounter.get(key);
  } catch (error) {
    console.error(
      JSON.stringify({ level: "error", msg: "rate limiter unavailable", error: String(error) }),
    );
    return { count: 0, resetSeconds: 0 };
  }
}

async function countIpFailure(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await failureCounter.increment(key, authPolicy.ipWindowSeconds);
  } catch (error) {
    console.error(
      JSON.stringify({ level: "error", msg: "rate limiter unavailable", error: String(error) }),
    );
  }
}

/**
 * Which secret the second login step asks for (FR-AUTH-01/02): a password
 * for accounts that have one (the Owner), a PIN otherwise. Unknown,
 * inactive and malformed usernames also get the PIN step, so the form does
 * not reveal which employee usernames exist.
 */
export async function loginMethodFor(username: string): Promise<"password" | "pin"> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return "pin";
  const user = await findUserByUsername(parsed.data);
  return user?.isActive && user.passwordHash ? "password" : "pin";
}

/**
 * Authenticates an owner (password) or employee (PIN) and opens a session
 * (FR-AUTH-01..05). Failures are indistinguishable except for lockouts,
 * which the user must be told about to act on. Every attempt is audited.
 * The per-IP limiter fails open: account lockout still applies.
 */
export async function login(
  input: LoginInput,
  context: RequestContext,
  now = new Date(),
): Promise<LoginResult> {
  const ipKey = context.ip ? `login-failures:${context.ip}` : null;
  const ip = await ipFailures(ipKey);
  if (ip.count >= authPolicy.ipMaxFailures) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: Math.max(ip.resetSeconds, 1) };
  }

  const user = await findUserByUsername(input.username);
  const storedHash = user?.passwordHash ?? user?.pinHash;

  if (!user?.isActive || !storedHash) {
    await verifyAgainstDummy(input.secret);
    await countIpFailure(ipKey);
    await recordAudit(
      db,
      {
        actorId: user?.id ?? null,
        action: "auth.login.failed",
        entity: "user",
        entityId: user?.id ?? null,
        diff: { username: input.username, reason: user ? "inactive" : "unknown-user" },
      },
      context,
    );
    return { ok: false, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    await recordAudit(
      db,
      {
        actorId: user.id,
        action: "auth.login.failed",
        entity: "user",
        entityId: user.id,
        diff: { reason: "locked" },
      },
      context,
    );
    return { ok: false, reason: "locked", retryAfterSeconds: secondsUntil(user.lockedUntil, now) };
  }

  if (!(await verifySecret(storedHash, input.secret))) {
    const lockUntil = new Date(now.getTime() + authPolicy.lockoutMinutes * MINUTE_MS);
    const lockedUntil = await registerFailedAttempt(
      user.id,
      authPolicy.maxFailedAttempts,
      lockUntil,
    );
    await countIpFailure(ipKey);
    await recordAudit(
      db,
      {
        actorId: user.id,
        action: lockedUntil ? "auth.login.locked" : "auth.login.failed",
        entity: "user",
        entityId: user.id,
        diff: { reason: "wrong-secret" },
      },
      context,
    );
    return lockedUntil
      ? { ok: false, reason: "locked", retryAfterSeconds: secondsUntil(lockedUntil, now) }
      : { ok: false, reason: "invalid" };
  }

  const session = await db.transaction(async (tx) => {
    await clearFailedAttempts(tx, user.id);
    await purgeExpiredSessions(tx, now);
    const created = await createSession(tx, user.id, context, now);
    await recordAudit(
      tx,
      { actorId: user.id, action: "auth.login.succeeded", entity: "user", entityId: user.id },
      context,
    );
    return created;
  });

  return { ok: true, ...session, mustChangePin: user.mustChangePin };
}

/** Ends the current session; the shift stays open (FR-AUTH-08). */
export async function logout(token: string, context: RequestContext): Promise<void> {
  const deleted = await deleteSession(token);
  if (!deleted) return;
  await recordAudit(
    db,
    { actorId: deleted.userId, action: "auth.logout", entity: "user", entityId: deleted.userId },
    context,
  );
}

export type ChangePinResult = { ok: true } | { ok: false; reason: "not-pin-account" | "same-pin" };

/**
 * Replaces the employee's PIN, clears the forced-change flag and signs out
 * other devices (FR-AUTH-06).
 */
export async function changePin(
  session: Session,
  input: ChangePinInput,
  context: RequestContext,
): Promise<ChangePinResult> {
  const currentHash = await findPinHash(session.user.id);
  if (!currentHash) return { ok: false, reason: "not-pin-account" };
  if (await verifySecret(currentHash, input.pin)) return { ok: false, reason: "same-pin" };

  const pinHash = await hashSecret(input.pin);
  await db.transaction(async (tx) => {
    await updatePin(tx, session.user.id, pinHash);
    await deleteOtherSessions(tx, session.user.id, session.id);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "auth.pin.changed",
        entity: "user",
        entityId: session.user.id,
      },
      context,
    );
  });
  return { ok: true };
}
