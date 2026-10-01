import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { auditLogs, recoveryCodes, users } from "@/db/schema";
import { authPolicy } from "@/lib/auth/policy";
import { validateSessionToken } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { fixtures, resetDatabase } from "@/test/database";

import {
  changePassword,
  generateRecoveryCodes,
  getRecoveryCodeStatus,
  login,
  recoverPassword,
  resetOwnerPassword,
} from "./service";

let ipCounter = 0;
/** A fresh client address per call keeps the in-memory IP limiter out of the way. */
function context(): RequestContext {
  ipCounter += 1;
  return {
    ip: `10.1.${String(Math.floor(ipCounter / 250))}.${String(ipCounter % 250)}`,
    userAgent: "vitest",
    requestId: null,
  };
}

const { username, password } = fixtures.owner;
const NEW_PASSWORD = "a-brand-new-passphrase";

async function ownerSession(secret = password) {
  const result = await login({ username, secret }, context());
  if (!result.ok) throw new Error(`login failed: ${result.reason}`);
  const session = await validateSessionToken(result.token);
  if (!session) throw new Error("session expected");
  return { token: result.token, session };
}

async function lastAudit() {
  const [entry] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
  return entry;
}

const signsIn = async (secret: string) => (await login({ username, secret }, context())).ok;

beforeEach(resetDatabase);

describe("changePassword (FR-AUTH-11)", () => {
  it("needs the current password and signs out other devices", async () => {
    const other = await ownerSession();
    const current = await ownerSession();
    const input = {
      currentPassword: password,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    };

    expect(
      await changePassword(
        current.session,
        { ...input, currentPassword: "wrong-password!" },
        context(),
      ),
    ).toEqual({ ok: false, reason: "wrong-password" });
    expect(
      await changePassword(
        current.session,
        { ...input, password, confirmPassword: password },
        context(),
      ),
    ).toEqual({ ok: false, reason: "same-password" });
    expect(await changePassword(current.session, input, context())).toEqual({ ok: true });

    expect(await validateSessionToken(current.token)).not.toBeNull();
    expect(await validateSessionToken(other.token)).toBeNull();
    expect(await signsIn(password)).toBe(false);
    expect(await signsIn(NEW_PASSWORD)).toBe(true);
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "auth.password.changed"));
    expect(audit?.actorId).toBe(current.session.user.id);
  });

  it("does not apply to PIN accounts", async () => {
    const result = await login({ username: "kasir", secret: "123456" }, context());
    if (!result.ok) throw new Error(result.reason);
    const session = await validateSessionToken(result.token);
    if (!session) throw new Error("session expected");
    expect(
      await changePassword(
        session,
        { currentPassword: "123456", password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
        context(),
      ),
    ).toEqual({ ok: false, reason: "not-password-account" });
    expect(await getRecoveryCodeStatus(session)).toBeNull();
  });
});

describe("recovery codes (FR-AUTH-12, ADR-0037)", () => {
  it("creates eight codes stored only as digests, replacing the previous set", async () => {
    const { session } = await ownerSession();
    expect(await getRecoveryCodeStatus(session)).toMatchObject({ total: 0, unused: 0 });
    expect(await generateRecoveryCodes(session, "wrong-password!", context())).toEqual({
      ok: false,
      reason: "wrong-password",
    });

    const first = await generateRecoveryCodes(session, password, context());
    if (!first.ok) throw new Error(first.reason);
    expect(first.codes).toHaveLength(8);
    const stored = await db.select().from(recoveryCodes);
    expect(stored).toHaveLength(8);
    for (const row of stored) expect(first.codes).not.toContain(row.codeHash);
    expect((await lastAudit())?.action).toBe("auth.recovery-codes.generated");

    const second = await generateRecoveryCodes(session, password, context());
    if (!second.ok) throw new Error(second.reason);
    expect(await getRecoveryCodeStatus(session)).toMatchObject({ total: 8, unused: 8 });
    const input = { username, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };
    expect(await recoverPassword({ ...input, code: first.codes[0] ?? "" }, context())).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("sets a new password with one code, once, and signs out every device", async () => {
    const { token, session } = await ownerSession();
    const generated = await generateRecoveryCodes(session, password, context());
    if (!generated.ok) throw new Error(generated.reason);
    const code = generated.codes[3] ?? "";
    const input = { username, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD };

    expect(
      await recoverPassword({ ...input, code: code.toLowerCase().replace(/-/g, " ") }, context()),
    ).toEqual({ ok: true });
    expect(await validateSessionToken(token)).toBeNull();
    expect(await signsIn(password)).toBe(false);
    expect(await signsIn(NEW_PASSWORD)).toBe(true);
    expect(await lastAudit()).toMatchObject({ action: "auth.login.succeeded" });
    const [recovered] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "auth.password.recovered"));
    expect(recovered?.diff).toEqual({ codesLeft: 7 });

    expect(
      await recoverPassword(
        {
          ...input,
          code,
          password: "yet-another-passphrase",
          confirmPassword: "yet-another-passphrase",
        },
        context(),
      ),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("answers the same for unknown users, PIN accounts and wrong codes, and locks after five", async () => {
    const { session } = await ownerSession();
    const generated = await generateRecoveryCodes(session, password, context());
    if (!generated.ok) throw new Error(generated.reason);
    const attempt = (user: string, code: string) =>
      recoverPassword(
        { username: user, code, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
        context(),
      );

    expect(await attempt("nobody", generated.codes[0] ?? "")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await attempt("kasir", generated.codes[0] ?? "")).toEqual({
      ok: false,
      reason: "invalid",
    });
    for (let index = 1; index < authPolicy.maxFailedAttempts; index += 1) {
      expect(await attempt(username, "AAAA-AAAA-AAAA-AAAA")).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    const locked = await attempt(username, "not a code");
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    expect(await attempt(username, generated.codes[0] ?? "")).toMatchObject({
      ok: false,
      reason: "locked",
    });
    expect((await lastAudit())?.action).toBe("auth.password.recovery-failed");
  });
});

describe("resetOwnerPassword (FR-AUTH-13, ADR-0037)", () => {
  it("sets a temporary password, lifts the lockout and signs out every device", async () => {
    const { token } = await ownerSession();
    await db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() + 60 * 60_000) })
      .where(eq(users.username, username));

    const result = await resetOwnerPassword({ ip: null, userAgent: "cli", requestId: null });
    expect(result?.username).toBe(username);
    expect(result?.password.length).toBeGreaterThanOrEqual(24);
    expect(await validateSessionToken(token)).toBeNull();
    expect(await signsIn(result?.password ?? "")).toBe(true);
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "auth.password.reset"));
    expect(audit).toMatchObject({ actorId: null, diff: { via: "cli" } });
  });
});
