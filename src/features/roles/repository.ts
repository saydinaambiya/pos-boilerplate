import "server-only";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { isPermission, type Permission } from "@/config/permissions";
import { db, type Executor } from "@/db/client";
import { rolePermissions, roles, users } from "@/db/schema";

export interface RoleSummary {
  id: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  permissionCount: number;
  userCount: number;
}

/** All roles with permission and member counts in one query (NFR-PERF-05). */
export async function listRoles(): Promise<RoleSummary[]> {
  const permissionCounts = db
    .select({ roleId: rolePermissions.roleId, total: count().as("permission_total") })
    .from(rolePermissions)
    .groupBy(rolePermissions.roleId)
    .as("permission_counts");
  const userCounts = db
    .select({ roleId: users.roleId, total: count().as("user_total") })
    .from(users)
    .groupBy(users.roleId)
    .as("user_counts");

  return db
    .select({
      id: roles.id,
      name: roles.name,
      isSystem: roles.isSystem,
      isActive: roles.isActive,
      permissionCount: sql<number>`coalesce(${permissionCounts.total}, 0)`.mapWith(Number),
      userCount: sql<number>`coalesce(${userCounts.total}, 0)`.mapWith(Number),
    })
    .from(roles)
    .leftJoin(permissionCounts, eq(permissionCounts.roleId, roles.id))
    .leftJoin(userCounts, eq(userCounts.roleId, roles.id))
    .orderBy(desc(roles.isSystem), asc(roles.name));
}

export async function findRole(id: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!role) return undefined;
  const granted = await db
    .select({ permission: rolePermissions.permission })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, id));
  return {
    ...role,
    permissions: granted
      .map((row) => row.permission)
      .filter(isPermission)
      .sort(),
  };
}

/** Active, non-system roles an employee can be given (BR-01: one owner). */
export async function listAssignableRoles() {
  return db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(and(eq(roles.isActive, true), eq(roles.isSystem, false)))
    .orderBy(asc(roles.name));
}

export async function insertRole(executor: Executor, name: string): Promise<string> {
  const [row] = await executor.insert(roles).values({ name }).returning({ id: roles.id });
  if (!row) throw new Error("Role insert returned no row");
  return row.id;
}

export async function renameRole(executor: Executor, id: string, name: string): Promise<void> {
  await executor.update(roles).set({ name }).where(eq(roles.id, id));
}

export async function replacePermissions(
  executor: Executor,
  roleId: string,
  granted: readonly Permission[],
): Promise<void> {
  await executor.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  if (granted.length > 0) {
    await executor
      .insert(rolePermissions)
      .values(granted.map((permission) => ({ roleId, permission })));
  }
}

export async function setRoleActive(
  executor: Executor,
  id: string,
  isActive: boolean,
): Promise<void> {
  await executor.update(roles).set({ isActive }).where(eq(roles.id, id));
}

export async function countActiveMembers(roleId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.roleId, roleId), eq(users.isActive, true)));
  return row?.total ?? 0;
}
