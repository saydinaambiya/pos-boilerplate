import { and, eq, gte, lt } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { auditLogs, auditPurges, users } from "@/db/schema";
import { login } from "@/features/auth/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import {
  AUDIT_PAGE_SIZE,
  exportAuditRange,
  getAuditActors,
  getPurgeStatus,
  listAuditLogs,
  purgeAuditRange,
  purgeRange,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

beforeEach(resetDatabase);

describe("audit log viewer (FR-AUD-03)", () => {
  it("lists newest first with the actor's name", async () => {
    await login({ username: "kasir", secret: "000000" }, testContext());
    const session = await owner();

    const { entries } = await listAuditLogs(session, {});
    expect(entries[0]).toMatchObject({ action: "auth.login.succeeded", actorName: "Owner" });
    expect(entries[1]).toMatchObject({ action: "auth.login.failed", actorName: "Kasir" });
  });

  it("filters by actor and action", async () => {
    await login({ username: "kasir", secret: "000000" }, testContext());
    const session = await owner();
    const [cashier] = await db.select().from(users).where(eq(users.username, "kasir"));

    const byActor = await listAuditLogs(session, { actor: cashier?.id ?? "" });
    expect(byActor.entries.every((entry) => entry.actorId === cashier?.id)).toBe(true);
    const byAction = await listAuditLogs(session, { action: "auth.login.succeeded" });
    expect(byAction.entries.map((entry) => entry.action)).toEqual(["auth.login.succeeded"]);
  });

  it("filters by calendar day in the store time zone", async () => {
    const session = await owner();
    await db.insert(auditLogs).values([
      {
        actorId: null,
        action: "auth.logout",
        entity: "user",
        createdAt: new Date("2026-09-25T16:59:59Z"),
      },
      {
        actorId: null,
        action: "auth.logout",
        entity: "user",
        createdAt: new Date("2026-09-25T17:00:00Z"),
      },
      {
        actorId: null,
        action: "auth.logout",
        entity: "user",
        createdAt: new Date("2026-09-26T16:59:59Z"),
      },
    ]);
    const { entries } = await listAuditLogs(session, {
      action: "auth.logout",
      from: "2026-09-26",
      to: "2026-09-26",
    });
    expect(entries.map((entry) => entry.createdAt.toISOString()).sort()).toEqual([
      "2026-09-25T17:00:00.000Z",
      "2026-09-26T16:59:59.000Z",
    ]);
  });

  it("pages with a cursor without gaps or duplicates", async () => {
    const session = await owner();
    await db.insert(auditLogs).values(
      Array.from({ length: AUDIT_PAGE_SIZE + 5 }, () => ({
        actorId: null,
        action: "auth.logout",
        entity: "user",
      })),
    );
    const first = await listAuditLogs(session, { action: "auth.logout" });
    expect(first.entries).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();

    const second = await listAuditLogs(session, {
      action: "auth.logout",
      cursor: first.nextCursor ?? "",
    });
    expect(second.entries).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = new Set([...first.entries, ...second.entries].map((entry) => entry.id));
    expect(ids.size).toBe(AUDIT_PAGE_SIZE + 5);
  });

  it("requires audit:view (NFR-SEC-07)", async () => {
    const cashier = await signIn("kasir", "123456");
    await expect(listAuditLogs(cashier, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAuditActors(cashier)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("audit log purge (FR-AUD-05)", () => {
  /** Two entries on 10 and 11 January (Asia/Jakarta) and one on the 12th. */
  async function seedOldEntries() {
    await db.insert(auditLogs).values(
      ["2026-01-10T03:00:00Z", "2026-01-11T03:00:00Z", "2026-01-12T03:00:00Z"].map((at) => ({
        actorId: null,
        action: "auth.logout",
        entity: "user",
        diff: { note: "=cmd" },
        createdAt: new Date(at),
      })),
    );
  }

  const countBetween = async (from: string, to: string) =>
    (
      await db
        .select()
        .from(auditLogs)
        .where(and(gte(auditLogs.createdAt, new Date(from)), lt(auditLogs.createdAt, new Date(to))))
    ).length;

  it("accepts only whole days before today", async () => {
    const now = new Date("2026-03-05T05:00:00Z");
    expect(await purgeRange("2026-03-01", "2026-03-04", now)).not.toBeNull();
    expect(await purgeRange("2026-03-01", "2026-03-05", now)).toBeNull();
    expect(await purgeRange("2026-03-04", "2026-03-01", now)).toBeNull();
    expect(await purgeRange("2026-02-30", "2026-03-01", now)).toBeNull();
  });

  it("deletes a range only after its CSV export, and audits both", async () => {
    await seedOldEntries();
    const session = await owner();
    const range = await purgeRange("2026-01-10", "2026-01-11");
    if (!range) throw new Error("range expected");

    expect(await purgeAuditRange(session, range, testContext())).toEqual({
      ok: false,
      reason: "not-exported",
    });
    expect(await getPurgeStatus(session, range)).toMatchObject({ count: 2, ready: false });

    const csv = await new Response(exportAuditRange(session, range, testContext())).text();
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "id,created_at,actor_username,actor_name,action,entity,entity_id,diff,ip,user_agent,request_id",
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"{""note"":""=cmd""}"');
    expect(await getPurgeStatus(session, range)).toMatchObject({ count: 2, ready: true });

    expect(await purgeAuditRange(session, range, testContext())).toEqual({ ok: true, deleted: 2 });
    expect(await countBetween("2026-01-09T17:00:00Z", "2026-01-11T17:00:00Z")).toBe(0);
    expect(await countBetween("2026-01-11T17:00:00Z", "2026-01-12T17:00:00Z")).toBe(1);

    const [purge] = await db.select().from(auditPurges);
    expect(purge).toMatchObject({ rowCount: 2, purgedBy: session.user.id });
    const actions = (await listAuditLogs(session, {})).entries.map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["audit.exported", "audit.purged"]));
    expect(await purgeAuditRange(session, range, testContext())).toEqual({
      ok: false,
      reason: "not-exported",
    });
  });

  it("asks for a new download when the range changed after the export", async () => {
    await seedOldEntries();
    const session = await owner();
    const range = await purgeRange("2026-01-10", "2026-01-12");
    if (!range) throw new Error("range expected");
    await new Response(exportAuditRange(session, range, testContext())).text();
    await db.delete(auditLogs).where(eq(auditLogs.createdAt, new Date("2026-01-12T03:00:00Z")));

    expect(await purgeAuditRange(session, range, testContext())).toEqual({
      ok: false,
      reason: "changed",
    });
    expect(await getPurgeStatus(session, range)).toMatchObject({ count: 2, ready: false });
  });

  it("is for the Owner only (NFR-SEC-07)", async () => {
    const cashier = await signIn("kasir", "123456");
    const range = await purgeRange("2026-01-10", "2026-01-11");
    if (!range) throw new Error("range expected");
    expect(() => exportAuditRange(cashier, range, testContext())).toThrow(ForbiddenError);
    await expect(purgeAuditRange(cashier, range, testContext())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
