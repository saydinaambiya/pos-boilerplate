import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_EMPLOYEE_ROLE, OWNER_ROLE_NAME, SEEDED_ROLES } from "@/config/permissions";
import { db } from "@/db/client";
import { auditLogs, roles } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/authorize";
import { fixtures, resetDatabase } from "@/test/database";
import { signIn, testContext } from "@/test/sessions";

import { changeRoleStatus, createRole, getRole, getRoles, updateRole } from "./service";

const owner = () => signIn(fixtures.owner.username, fixtures.owner.password);

async function roleIdByName(name: string): Promise<string> {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, name));
  if (!role) throw new Error(`role ${name} missing`);
  return role.id;
}

beforeEach(resetDatabase);

describe("roles service (FR-RBAC-01)", () => {
  it("lists roles with permission and member counts, Owner first", async () => {
    const list = await getRoles(await owner());
    expect(list.map((role) => role.name)).toEqual([
      OWNER_ROLE_NAME,
      ...[DEFAULT_EMPLOYEE_ROLE, ...SEEDED_ROLES].map((role) => role.name).sort(),
    ]);
    expect(list.find((role) => role.name === "Sales")).toMatchObject({
      permissionCount: 3,
      userCount: 0,
    });
    expect(list.find((role) => role.name === DEFAULT_EMPLOYEE_ROLE.name)).toMatchObject({
      permissionCount: DEFAULT_EMPLOYEE_ROLE.permissions.length,
      userCount: fixtures.employees.length,
    });
  });

  it("creates a role with deduplicated permissions and audits it", async () => {
    const session = await owner();
    const result = await createRole(
      session,
      { name: "Supervisor", permissions: ["page:pos", "stock:adjust"] },
      testContext(),
    );
    if (!result.ok) throw new Error(result.reason);

    expect((await getRole(session, result.id))?.permissions).toEqual(["page:pos", "stock:adjust"]);
    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit).toMatchObject({ action: "role.created", entityId: result.id });
  });

  it("rejects duplicate names case-insensitively", async () => {
    expect(
      await createRole(await owner(), { name: "karyawan", permissions: [] }, testContext()),
    ).toEqual({ ok: false, reason: "name-taken" });
  });

  it("updates permissions and records what was added and removed", async () => {
    const session = await owner();
    const id = await roleIdByName(DEFAULT_EMPLOYEE_ROLE.name);
    const result = await updateRole(
      session,
      id,
      { name: "Kasir", permissions: ["page:dashboard", "page:pos", "voucher:request"] },
      testContext(),
    );
    expect(result).toEqual({ ok: true, id });

    const [audit] = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
    expect(audit?.diff).toEqual({
      name: { from: DEFAULT_EMPLOYEE_ROLE.name, to: "Kasir" },
      added: ["voucher:request"],
      removed: ["page:online-orders", "page:products", "page:stock"],
    });
  });

  it("never changes the Owner role", async () => {
    const session = await owner();
    const id = await roleIdByName(OWNER_ROLE_NAME);
    expect(await updateRole(session, id, { name: "Boss", permissions: [] }, testContext())).toEqual(
      {
        ok: false,
        reason: "system-role",
      },
    );
    expect(await changeRoleStatus(session, id, false, testContext())).toEqual({
      ok: false,
      reason: "system-role",
    });
  });

  it("refuses to deactivate a role that active employees still use", async () => {
    const session = await owner();
    const id = await roleIdByName(DEFAULT_EMPLOYEE_ROLE.name);
    expect(await changeRoleStatus(session, id, false, testContext())).toEqual({
      ok: false,
      reason: "role-in-use",
    });

    const empty = await createRole(session, { name: "Gudang", permissions: [] }, testContext());
    if (!empty.ok) throw new Error(empty.reason);
    expect(await changeRoleStatus(session, empty.id, false, testContext())).toEqual({
      ok: true,
      id: empty.id,
    });
    expect((await getRole(session, empty.id))?.isActive).toBe(false);
  });

  it("requires role:manage in the service itself (NFR-SEC-07)", async () => {
    const cashier = await signIn("kasir", "123456");
    await expect(getRoles(cashier)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createRole(cashier, { name: "Hack", permissions: ["role:manage"] }, testContext()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
