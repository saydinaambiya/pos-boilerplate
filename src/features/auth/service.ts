import "server-only";

import { db } from "@/db/client";
import { recordAudit } from "@/lib/audit/audit";
import { randomBytes } from "node:crypto";

import { hashSecret, verifyAgainstDummy, verifySecret } from "@/lib/auth/credentials";
import { authPolicy } from "@/lib/auth/policy";
import {
  createRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "@/lib/auth/recovery-codes";
import {
  countActiveSessions,
  createSession,
  deleteOtherSessions,
  deleteSession,
  deleteUserSessions,
  purgeExpiredSessions,
  type Session,
} from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { failureCounter } from "@/lib/security/rate-limit";
import { readSetting } from "@/lib/settings/store";

import {
  clearFailedAttempts,
  findOwner,
  findPasswordHash,
  findPinHash,
  findUserByUsername,
  lockUser,
  recoveryCodeCounts,
  registerFailedAttempt,
  replaceRecoveryCodes,
  updatePassword,
  updatePin,
  useRecoveryCode,
} from "./repository";
import {
  type ChangePasswordInput,
  type ChangePinInput,
  type LoginInput,
  type RecoverPasswordInput,
  usernameSchema,
} from "./schemas";

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; mustChangePin: boolean }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "device-limit"; maxDevices: number }
  | { ok: false; reason: "locked" | "rate-limited"; retryAfterSeconds: number };

const MINUTE_MS = 60_000;

function secondsUntil(date: Date, now: Date): number {
  return Math.max(Math.ceil((date.getTime() - now.getTime()) / 1000), 1);
}

/** Counts a wrong secret against the account and returns the lock expiry if it locked (FR-AUTH-04). */
function countFailure(userId: string, now: Date): Promise<Date | null> {
  const lockUntil = new Date(now.getTime() + authPolicy.lockoutMinutes * MINUTE_MS);
  return registerFailedAttempt(userId, authPolicy.maxFailedAttempts, lockUntil);
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
 *
 * A correct secret is still refused when the account is already signed in
 * on the maximum number of devices (FR-AUTH-09); the user row is locked so
 * two simultaneous logins cannot both take the last slot. The user then
 * signs a device out from the devices page, or the owner does it for them.
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
    const lockedUntil = await countFailure(user.id, now);
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

  const { maxDevicesPerUser } = await readSetting("operations");
  const session = await db.transaction(async (tx) => {
    await lockUser(tx, user.id);
    await clearFailedAttempts(tx, user.id);
    await purgeExpiredSessions(tx, now);
    if ((await countActiveSessions(tx, user.id, now)) >= maxDevicesPerUser) return null;
    const created = await createSession(tx, user.id, context, now);
    await recordAudit(
      tx,
      { actorId: user.id, action: "auth.login.succeeded", entity: "user", entityId: user.id },
      context,
    );
    return created;
  });

  if (!session) {
    await recordAudit(
      db,
      {
        actorId: user.id,
        action: "auth.login.failed",
        entity: "user",
        entityId: user.id,
        diff: { reason: "device-limit", maxDevices: maxDevicesPerUser },
      },
      context,
    );
    return { ok: false, reason: "device-limit", maxDevices: maxDevicesPerUser };
  }
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

export type ChangePasswordResult =
  { ok: true } | { ok: false; reason: "not-password-account" | "wrong-password" | "same-password" };

/**
 * Replaces the Owner's password after checking the current one, and signs
 * out other devices (FR-AUTH-11). A wrong current password counts towards
 * the lockout like a failed login (FR-AUTH-04).
 */
export async function changePassword(
  session: Session,
  input: ChangePasswordInput,
  context: RequestContext,
  now = new Date(),
): Promise<ChangePasswordResult> {
  const currentHash = await findPasswordHash(session.user.id);
  if (!currentHash) return { ok: false, reason: "not-password-account" };
  if (!(await verifySecret(currentHash, input.currentPassword))) {
    await countFailure(session.user.id, now);
    return { ok: false, reason: "wrong-password" };
  }
  if (input.password === input.currentPassword) return { ok: false, reason: "same-password" };

  const passwordHash = await hashSecret(input.password);
  await db.transaction(async (tx) => {
    await updatePassword(tx, session.user.id, passwordHash);
    await deleteOtherSessions(tx, session.user.id, session.id);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "auth.password.changed",
        entity: "user",
        entityId: session.user.id,
      },
      context,
    );
  });
  return { ok: true };
}

export type RecoveryCodesResult =
  { ok: true; codes: string[] } | { ok: false; reason: "not-password-account" | "wrong-password" };

/**
 * A new set of single-use recovery codes, returned once and stored only as
 * digests; the previous set stops working (FR-AUTH-12, ADR-0037). Needs the
 * current password, counted like a login attempt.
 */
export async function generateRecoveryCodes(
  session: Session,
  currentPassword: string,
  context: RequestContext,
  now = new Date(),
): Promise<RecoveryCodesResult> {
  const currentHash = await findPasswordHash(session.user.id);
  if (!currentHash) return { ok: false, reason: "not-password-account" };
  if (!(await verifySecret(currentHash, currentPassword))) {
    await countFailure(session.user.id, now);
    return { ok: false, reason: "wrong-password" };
  }
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, createRecoveryCode);
  await db.transaction(async (tx) => {
    await replaceRecoveryCodes(tx, session.user.id, codes.map(hashRecoveryCode));
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "auth.recovery-codes.generated",
        entity: "user",
        entityId: session.user.id,
        diff: { count: codes.length },
      },
      context,
    );
  });
  return { ok: true, codes };
}

/** Unused and total recovery codes of a password account, or null for PIN accounts (ADR-0037). */
export async function getRecoveryCodeStatus(session: Session) {
  if (session.user.credential !== "password") return null;
  return recoveryCodeCounts(db, session.user.id);
}

export type RecoverPasswordResult =
  | { ok: true }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked" | "rate-limited"; retryAfterSeconds: number };

/**
 * Sets a new password with one unused recovery code (FR-AUTH-12, ADR-0037).
 * Wrong codes count towards the account lockout and the per-IP limit like
 * failed logins (FR-AUTH-04); unknown users, PIN accounts and wrong codes
 * give the same answer. Success uses up the code, lifts the lockout, signs
 * out every device and is audited with the codes left.
 */
export async function recoverPassword(
  input: RecoverPasswordInput,
  context: RequestContext,
  now = new Date(),
): Promise<RecoverPasswordResult> {
  const ipKey = context.ip ? `login-failures:${context.ip}` : null;
  const ip = await ipFailures(ipKey);
  if (ip.count >= authPolicy.ipMaxFailures) {
    return { ok: false, reason: "rate-limited", retryAfterSeconds: Math.max(ip.resetSeconds, 1) };
  }

  const user = await findUserByUsername(input.username);
  const fail = async (reason: string) => {
    await countIpFailure(ipKey);
    await recordAudit(
      db,
      {
        actorId: user?.id ?? null,
        action: "auth.password.recovery-failed",
        entity: "user",
        entityId: user?.id ?? null,
        diff: { username: input.username, reason },
      },
      context,
    );
  };
  if (!user?.isActive || !user.passwordHash) {
    await fail(user ? "not-password-account" : "unknown-user");
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > now) {
    await fail("locked");
    return { ok: false, reason: "locked", retryAfterSeconds: secondsUntil(user.lockedUntil, now) };
  }

  const code = normalizeRecoveryCode(input.code);
  const passwordHash = code ? await hashSecret(input.password) : null;
  const recovered =
    code !== null &&
    passwordHash !== null &&
    (await db.transaction(async (tx) => {
      await lockUser(tx, user.id);
      if (!(await useRecoveryCode(tx, user.id, hashRecoveryCode(code), now))) return false;
      await updatePassword(tx, user.id, passwordHash);
      await deleteUserSessions(tx, user.id);
      const { unused } = await recoveryCodeCounts(tx, user.id);
      await recordAudit(
        tx,
        {
          actorId: user.id,
          action: "auth.password.recovered",
          entity: "user",
          entityId: user.id,
          diff: { codesLeft: unused },
        },
        context,
      );
      return true;
    }));
  if (recovered) return { ok: true };

  const lockedUntil = await countFailure(user.id, now);
  await fail("wrong-code");
  return lockedUntil
    ? { ok: false, reason: "locked", retryAfterSeconds: secondsUntil(lockedUntil, now) }
    : { ok: false, reason: "invalid" };
}

/**
 * Last resort when the Owner lost both password and recovery codes: sets a
 * random temporary password, lifts the lockout and signs out every device
 * (FR-AUTH-13, ADR-0037). Run by whoever operates the database through
 * `pnpm owner:reset-password`; audited without an actor.
 */
export async function resetOwnerPassword(
  context: RequestContext,
): Promise<{ username: string; password: string } | null> {
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await hashSecret(password);
  return db.transaction(async (tx) => {
    const owner = await findOwner(tx);
    if (!owner) return null;
    await updatePassword(tx, owner.id, passwordHash);
    await deleteUserSessions(tx, owner.id);
    await recordAudit(
      tx,
      {
        actorId: null,
        action: "auth.password.reset",
        entity: "user",
        entityId: owner.id,
        diff: { via: "cli" },
      },
      context,
    );
    return { username: owner.username, password };
  });
}
