import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { auditLogs, users } from "@/db/schema";
import { login } from "@/features/auth/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { AUDIT_PAGE_SIZE, getAuditActors, listAuditLogs } from "./service";

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
