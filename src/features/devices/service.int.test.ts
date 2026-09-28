import { desc } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { login } from "@/features/auth/service";
import { validateSessionToken } from "@/lib/auth/session";
import { settingDefinitions } from "@/lib/settings/schemas";
import { writeSetting } from "@/lib/settings/store";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, signInNewDevice, testContext } from "@/test/sessions";

import { endMyDevice, endUserDevice, getMyDevices, getUserDevices } from "./service";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function signInKasir() {
  return login({ username: "kasir", secret: "123456" }, testContext());
}

beforeEach(resetDatabase);

describe("device limit (FR-AUTH-09)", () => {
  it("refuses a fourth device until one is signed out", async () => {
    const devices = [
      await signInNewDevice("kasir", "123456"),
      await signInNewDevice("kasir", "123456"),
    ];
    expect((await signInKasir()).ok).toBe(true);

    expect(await signInKasir()).toEqual({ ok: false, reason: "device-limit", maxDevices: 3 });
    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit).toMatchObject({
      action: "auth.login.failed",
      diff: { reason: "device-limit", maxDevices: 3 },
    });

    const [current, other] = devices;
    if (!current || !other) throw new Error("sessions expected");
    expect(await endMyDevice(current, other.id, testContext())).toEqual({ ok: true });
    expect((await signInKasir()).ok).toBe(true);
  });

  it("follows the owner's setting and ignores expired sessions", async () => {
    await writeSetting(db, "operations", {
      ...settingDefinitions.operations.defaults,
      maxDevicesPerUser: 1,
    });
    const now = new Date();
    expect((await login({ username: "kasir", secret: "123456" }, testContext(), now)).ok).toBe(
      true,
    );
    expect((await login({ username: "kasir", secret: "123456" }, testContext(), now)).ok).toBe(
      false,
    );
    const later = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    expect((await login({ username: "kasir", secret: "123456" }, testContext(), later)).ok).toBe(
      true,
    );
  });

  it("does not let concurrent logins overshoot the limit", async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => signInKasir()));
    expect(results.filter((result) => result.ok)).toHaveLength(3);
  });
});

describe("device list (FR-AUTH-10)", () => {
  it("lists the viewer's devices with the current one marked", async () => {
    const result = await login(
      { username: "kasir", secret: "123456" },
      { ip: "10.9.0.1", userAgent: CHROME_MAC, requestId: "req-device" },
    );
    if (!result.ok) throw new Error(result.reason);
    const session = await validateSessionToken(result.token);
    if (!session) throw new Error("session expected");
    await signInNewDevice("kasir", "123456");

    const mine = await getMyDevices(session);
    expect(mine.maxDevices).toBe(3);
    expect(mine.devices).toHaveLength(2);
    expect(mine.devices.find((device) => device.current)).toMatchObject({
      id: session.id,
      browser: "Chrome",
      os: "macOS",
      ip: "10.9.0.1",
    });
  });

  it("never ends the current device from the list", async () => {
    const session = await signIn("kasir", "123456");
    expect(await endMyDevice(session, session.id, testContext())).toEqual({
      ok: false,
      reason: "current",
    });
  });

  it("cannot end another user's session as one's own device", async () => {
    const kasir = await signIn("kasir", "123456");
    const other = await signIn("kasir-baru", "111111");
    expect(await endMyDevice(kasir, other.id, testContext())).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("lets the owner force an employee's device out", async () => {
    const owner = await signIn(fixtures.owner.username, fixtures.owner.password);
    const kasir = await signIn("kasir", "123456");

    const listed = await getUserDevices(owner, kasir.user.id);
    expect(listed?.devices.map((device) => device.id)).toEqual([kasir.id]);
    expect(await endUserDevice(owner, kasir.user.id, kasir.id, testContext())).toEqual({
      ok: true,
    });
    expect(await getUserDevices(owner, kasir.user.id)).toMatchObject({ devices: [] });
    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit).toMatchObject({
      action: "auth.session.ended",
      actorId: owner.user.id,
      entityId: kasir.user.id,
    });
  });

  it("requires employee:manage to manage other accounts", async () => {
    const kasir = await signIn("kasir", "123456");
    const owner = await signIn(fixtures.owner.username, fixtures.owner.password);
    await expect(getUserDevices(kasir, owner.user.id)).rejects.toThrow();
    await expect(endUserDevice(kasir, owner.user.id, owner.id, testContext())).rejects.toThrow();
  });
});
