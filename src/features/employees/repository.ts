import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { db, type Executor } from "@/db/client";
import { roles, users } from "@/db/schema";

const employeeColumns = {
  id: users.id,
  username: users.username,
  name: users.name,
  isActive: users.isActive,
  mustChangePin: users.mustChangePin,
  lockedUntil: users.lockedUntil,
  roleId: roles.id,
  roleName: roles.name,
  isOwner: roles.isSystem,
};

export type Employee = Awaited<ReturnType<typeof listEmployees>>[number];

/** Every account with its role, owner first (one query, NFR-PERF-05). */
export async function listEmployees() {
  return db
    .select(employeeColumns)
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .orderBy(desc(roles.isSystem), desc(users.isActive), asc(users.name));
}

export async function findEmployee(id: string) {
  const [employee] = await db
    .select(employeeColumns)
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, id))
    .limit(1);
  return employee;
}

export async function insertEmployee(
  executor: Executor,
  values: { username: string; name: string; roleId: string; pinHash: string },
): Promise<string> {
  const [row] = await executor
    .insert(users)
    .values({ ...values, mustChangePin: true })
    .returning({ id: users.id });
  if (!row) throw new Error("Employee insert returned no row");
  return row.id;
}

export async function updateEmployeeProfile(
  executor: Executor,
  id: string,
  values: { name: string; roleId: string },
): Promise<void> {
  await executor.update(users).set(values).where(eq(users.id, id));
}

export async function setEmployeeActive(
  executor: Executor,
  id: string,
  isActive: boolean,
): Promise<void> {
  await executor.update(users).set({ isActive }).where(eq(users.id, id));
}

export async function setTemporaryPin(
  executor: Executor,
  id: string,
  pinHash: string,
): Promise<void> {
  await executor
    .update(users)
    .set({ pinHash, mustChangePin: true, failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, id));
}
