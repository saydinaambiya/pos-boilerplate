import { and, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, permissions } from "@/config/permissions";
import { db } from "@/db/client";
import { auditLogs, rolePermissions, roles, sessions, users } from "@/db/schema";
import { authPolicy } from "@/lib/auth/policy";
import { hashSessionToken } from "@/lib/auth/session-token";
import { validateSessionToken } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";
import { fixtures, resetDatabase } from "@/test/database";

import { changePin, login, logout } from "./service";

let ipCounter = 0;
/** A fresh client address per test keeps the in-memory IP limiter isolated. */
function context(): RequestContext {
  ipCounter += 1;
  return { ip: `10.0.0.${ipCounter}`, userAgent: "vitest", requestId: `req-${ipCounter}` };
}

async function lastAudit() {
  const [entry] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
  return entry;
}

async function loginOk(username: string, secret: string, ctx = context()) {
  const result = await login({ username, secret }, ctx);
  if (!result.ok) throw new Error(`expected login to succeed, got ${result.reason}`);
  return result;
}

beforeEach(resetDatabase);

describe("login (FR-AUTH-01..05)", () => {
  it("signs the owner in with a password and audits it", async () => {
    const result = await loginOk(fixtures.owner.username, fixtures.owner.password);

    const [stored] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(result.token)));
    expect(stored?.ip).toMatch(/^10\.0\.0\./);
    expect(stored?.tokenHash).not.toBe(result.token);
    expect((await lastAudit())?.action).toBe("auth.login.succeeded");
  });

  it("signs an employee in with a PIN and reports a pending PIN change", async () => {
    const result = await loginOk("kasir-baru", "111111");
    expect(result.mustChangePin).toBe(true);
  });

  it("rejects wrong secrets and unknown users with the same answer", async () => {
    expect(await login({ username: "kasir", secret: "000000" }, context())).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await login({ username: "nobody", secret: "000000" }, context())).toEqual({
      ok: false,
      reason: "invalid",
    });
    const audit = await lastAudit();
    expect(audit?.action).toBe("auth.login.failed");
    expect(audit?.diff).toEqual({ username: "nobody", reason: "unknown-user" });
  });

  it("rejects inactive accounts (FR-EMP-02)", async () => {
    await db.update(users).set({ isActive: false }).where(eq(users.username, "kasir"));
    expect(await login({ username: "kasir", secret: "123456" }, context())).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("locks the account after five failures, even for the right PIN", async () => {
    const now = new Date();
    for (let attempt = 1; attempt < authPolicy.maxFailedAttempts; attempt += 1) {
      expect((await login({ username: "kasir", secret: "000000" }, context(), now)).ok).toBe(false);
    }
    const fifth = await login({ username: "kasir", secret: "000000" }, context(), now);
    expect(fifth).toEqual({
      ok: false,
      reason: "locked",
      retryAfterSeconds: authPolicy.lockoutMinutes * 60,
    });
    expect((await lastAudit())?.action).toBe("auth.login.locked");

    const correct = await login({ username: "kasir", secret: "123456" }, context(), now);
    expect(correct).toMatchObject({ ok: false, reason: "locked" });

    const later = new Date(now.getTime() + (authPolicy.lockoutMinutes + 1) * 60_000);
    expect((await login({ username: "kasir", secret: "123456" }, context(), later)).ok).toBe(true);
  });

  it("resets the failure counter after a successful login", async () => {
    await login({ username: "kasir", secret: "000000" }, context());
    await loginOk("kasir", "123456");
    const [row] = await db.select().from(users).where(eq(users.username, "kasir"));
    expect(row?.failedAttempts).toBe(0);
  });

  it("rate-limits an address after too many failures across accounts", async () => {
    const ctx = context();
    for (let attempt = 0; attempt < authPolicy.ipMaxFailures; attempt += 1) {
      await login({ username: `ghost${attempt}`, secret: "000000" }, ctx);
    }
    expect(await login({ username: "kasir", secret: "123456" }, ctx)).toMatchObject({
      ok: false,
      reason: "rate-limited",
    });
  });
});

describe("sessions and permissions (FR-AUTH-05, FR-RBAC-03)", () => {
  it("grants the owner every permission", async () => {
    const { token } = await loginOk(fixtures.owner.username, fixtures.owner.password);
    const session = await validateSessionToken(token);
    expect(session?.role.isSystem).toBe(true);
    expect(session?.user.credential).toBe("password");
    expect([...(session?.permissions ?? [])].sort()).toEqual([...permissions].sort());
  });

  it("grants employees only their role's permissions, re-read on every request", async () => {
    const { token } = await loginOk("kasir", "123456");
    const session = await validateSessionToken(token);
    expect([...(session?.permissions ?? [])].sort()).toEqual(
      [...DEFAULT_EMPLOYEE_ROLE.permissions].sort(),
    );

    const [role] = await db.select().from(roles).where(eq(roles.name, DEFAULT_EMPLOYEE_ROLE.name));
    await db
      .delete(rolePermissions)
      .where(
        and(eq(rolePermissions.roleId, role?.id ?? ""), eq(rolePermissions.permission, "page:pos")),
      );
    expect((await validateSessionToken(token))?.permissions.has("page:pos")).toBe(false);

    await db
      .update(roles)
      .set({ isActive: false })
      .where(eq(roles.id, role?.id ?? ""));
    expect((await validateSessionToken(token))?.permissions.size).toBe(0);
  });

  it("ends sessions of deactivated users immediately", async () => {
    const { token } = await loginOk("kasir", "123456");
    await db.update(users).set({ isActive: false }).where(eq(users.username, "kasir"));
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("expires idle sessions and slides the expiry on activity", async () => {
    const start = new Date();
    const { token, expiresAt } = await loginOk("kasir", "123456");
    const idleMs = authPolicy.sessionIdleMinutes * 60_000;

    const active = new Date(start.getTime() + idleMs / 2);
    const refreshed = await validateSessionToken(token, active);
    expect(refreshed?.expiresAt.getTime()).toBeGreaterThan(expiresAt.getTime());

    const afterIdle = new Date((refreshed?.expiresAt.getTime() ?? 0) + 1000);
    expect(await validateSessionToken(token, afterIdle)).toBeNull();
  });

  it("deletes the session on logout and audits it", async () => {
    const { token } = await loginOk("kasir", "123456");
    await logout(token, context());
    expect(await validateSessionToken(token)).toBeNull();
    expect((await lastAudit())?.action).toBe("auth.logout");
  });
});

describe("changePin (FR-AUTH-06)", () => {
  async function sessionFor(username: string, pin: string) {
    const { token } = await loginOk(username, pin);
    const session = await validateSessionToken(token);
    if (!session) throw new Error("session expected");
    return { token, session };
  }

  it("replaces the PIN, clears the flag and signs out other devices", async () => {
    const other = await sessionFor("kasir-baru", "111111");
    const current = await sessionFor("kasir-baru", "111111");

    expect(
      await changePin(current.session, { pin: "654321", confirmPin: "654321" }, context()),
    ).toEqual({
      ok: true,
    });

    expect((await validateSessionToken(current.token))?.user.mustChangePin).toBe(false);
    expect(await validateSessionToken(other.token)).toBeNull();
    expect((await login({ username: "kasir-baru", secret: "111111" }, context())).ok).toBe(false);
    expect((await login({ username: "kasir-baru", secret: "654321" }, context())).ok).toBe(true);

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "auth.pin.changed"));
    expect(audit?.actorId).toBe(current.session.user.id);
  });

  it("refuses to keep the same PIN", async () => {
    const { session } = await sessionFor("kasir-baru", "111111");
    expect(await changePin(session, { pin: "111111", confirmPin: "111111" }, context())).toEqual({
      ok: false,
      reason: "same-pin",
    });
  });

  it("does not apply to password accounts", async () => {
    const { session } = await sessionFor(fixtures.owner.username, fixtures.owner.password);
    expect(await changePin(session, { pin: "222222", confirmPin: "222222" }, context())).toEqual({
      ok: false,
      reason: "not-pin-account",
    });
  });
});
