import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, OWNER_ROLE_NAME } from "@/config/permissions";
import { db } from "@/db/client";
import { auditLogs, roles, users } from "@/db/schema";
import { login } from "@/features/auth/service";
import { createRole } from "@/features/roles/service";
import { ForbiddenError } from "@/lib/auth/authorize";
import { validateSessionToken } from "@/lib/auth/session";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import {
  changeEmployeeStatus,
  createEmployee,
  getEmployee,
  getEmployees,
  resetEmployeePin,
  updateEmployee,
} from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

async function roleId(name: string): Promise<string> {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name));
  if (!role) throw new Error(`role ${name} missing`);
  return role.id;
}

async function userId(username: string): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (!user) throw new Error(`user ${username} missing`);
  return user.id;
}

beforeEach(resetDatabase);

describe("employees service (FR-EMP-01/02)", () => {
  it("lists the owner first", async () => {
    const list = await getEmployees(await owner());
    expect(list[0]).toMatchObject({ username: fixtures.owner.username, isOwner: true });
    expect(list).toHaveLength(1 + fixtures.employees.length);
  });

  it("creates an employee who must change the initial PIN", async () => {
    const session = await owner();
    const result = await createEmployee(
      session,
      {
        name: "Sari",
        username: "sari",
        roleId: await roleId(DEFAULT_EMPLOYEE_ROLE.name),
        pin: "135790",
      },
      testContext(),
    );
    if (!result.ok) throw new Error(result.reason);

    expect(await getEmployee(session, result.id)).toMatchObject({
      mustChangePin: true,
      isActive: true,
    });
    expect(await login({ username: "sari", secret: "135790" }, testContext())).toMatchObject({
      ok: true,
      mustChangePin: true,
    });
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "employee.created"));
    expect(JSON.stringify(audit?.diff)).not.toContain("135790");
  });

  it("rejects taken usernames and non-assignable roles", async () => {
    const session = await owner();
    const cashierRole = await roleId(DEFAULT_EMPLOYEE_ROLE.name);
    expect(
      await createEmployee(
        session,
        { name: "X", username: "kasir", roleId: cashierRole, pin: "135790" },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "username-taken" });
    expect(
      await createEmployee(
        session,
        { name: "X", username: "boss2", roleId: await roleId(OWNER_ROLE_NAME), pin: "135790" },
        testContext(),
      ),
    ).toEqual({ ok: false, reason: "invalid-role" });
  });

  it("updates name and role; the new role applies on the next request", async () => {
    const session = await owner();
    const supervisor = await createRole(
      session,
      { name: "Supervisor", permissions: ["page:settings"] },
      testContext(),
    );
    if (!supervisor.ok) throw new Error(supervisor.reason);
    const cashierToken = await login({ username: "kasir", secret: "123456" }, testContext());
    if (!cashierToken.ok) throw new Error("login failed");

    const id = await userId("kasir");
    expect(
      await updateEmployee(
        session,
        id,
        { name: "Kasir Utama", roleId: supervisor.id },
        testContext(),
      ),
    ).toEqual({
      ok: true,
      id,
    });
    const refreshed = await validateSessionToken(cashierToken.token);
    expect(refreshed?.user.name).toBe("Kasir Utama");
    expect(refreshed?.permissions.has("page:settings")).toBe(true);
    expect(refreshed?.permissions.has("page:pos")).toBe(false);
  });

  it("protects the owner account (BR-01)", async () => {
    const session = await owner();
    const ownerId = await userId(fixtures.owner.username);
    const cashierRole = await roleId(DEFAULT_EMPLOYEE_ROLE.name);
    expect(
      await updateEmployee(session, ownerId, { name: "X", roleId: cashierRole }, testContext()),
    ).toEqual({
      ok: false,
      reason: "owner-protected",
    });
    expect(await changeEmployeeStatus(session, ownerId, false, testContext())).toEqual({
      ok: false,
      reason: "owner-protected",
    });
    expect(await resetEmployeePin(session, ownerId, { pin: "111111" }, testContext())).toEqual({
      ok: false,
      reason: "owner-protected",
    });
  });

  it("deactivation ends sessions immediately and blocks login (FR-EMP-02)", async () => {
    const session = await owner();
    const cashierToken = await login({ username: "kasir", secret: "123456" }, testContext());
    if (!cashierToken.ok) throw new Error("login failed");
    const id = await userId("kasir");

    expect(await changeEmployeeStatus(session, id, false, testContext())).toEqual({ ok: true, id });
    expect(await validateSessionToken(cashierToken.token)).toBeNull();
    expect((await login({ username: "kasir", secret: "123456" }, testContext())).ok).toBe(false);

    expect(await changeEmployeeStatus(session, id, true, testContext())).toEqual({ ok: true, id });
    expect((await login({ username: "kasir", secret: "123456" }, testContext())).ok).toBe(true);
  });

  it("does not let a manager deactivate their own account", async () => {
    const session = await owner();
    const manager = await createRole(
      session,
      { name: "Manajer", permissions: ["page:employees", "employee:manage"] },
      testContext(),
    );
    if (!manager.ok) throw new Error(manager.reason);
    const id = await userId("kasir");
    await updateEmployee(session, id, { name: "Kasir", roleId: manager.id }, testContext());

    const self = await signIn("kasir", "123456");
    expect(await changeEmployeeStatus(self, id, false, testContext())).toEqual({
      ok: false,
      reason: "self",
    });
  });

  it("resets a PIN: unlocks, forces a change, ends sessions, keeps the PIN out of the audit log", async () => {
    const session = await owner();
    const id = await userId("kasir");
    const cashierToken = await login({ username: "kasir", secret: "123456" }, testContext());
    if (!cashierToken.ok) throw new Error("login failed");
    await db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() + 600_000) })
      .where(eq(users.id, id));

    expect(await resetEmployeePin(session, id, { pin: "975310" }, testContext())).toEqual({
      ok: true,
      id,
    });
    expect(await validateSessionToken(cashierToken.token)).toBeNull();
    expect(await login({ username: "kasir", secret: "975310" }, testContext())).toMatchObject({
      ok: true,
      mustChangePin: true,
    });
    const recent = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(3);
    expect(recent.map((entry) => entry.action)).toContain("employee.pin.reset");
    expect(JSON.stringify(recent)).not.toContain("975310");
  });

  it("requires employee:manage for changes (NFR-SEC-07)", async () => {
    const cashier = await signIn("kasir", "123456");
    await expect(
      resetEmployeePin(cashier, await userId("kasir-baru"), { pin: "111112" }, testContext()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
