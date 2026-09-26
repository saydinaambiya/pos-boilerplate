import "server-only";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { isAssignableRole } from "@/features/roles/service";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import { hashSecret } from "@/lib/auth/credentials";
import { deleteUserSessions, type Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import {
  findEmployee,
  insertEmployee,
  listEmployees,
  setEmployeeActive,
  setTemporaryPin,
  updateEmployeeProfile,
} from "./repository";
import type { CreateEmployeeInput, ResetPinInput, UpdateEmployeeInput } from "./schemas";

export type EmployeeResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "not-found" | "username-taken" | "invalid-role" | "owner-protected" | "self";
    };

export async function getEmployees(session: Session) {
  assertPermission(session, "page:employees");
  return listEmployees();
}

export async function getEmployee(session: Session, id: string) {
  assertPermission(session, "page:employees");
  return findEmployee(id);
}

/**
 * Creates an employee with an initial PIN that must be replaced at first
 * login (FR-EMP-01, FR-AUTH-06). Only non-system, active roles are allowed,
 * so there is never a second owner (BR-01).
 */
export async function createEmployee(
  session: Session,
  input: CreateEmployeeInput,
  context: RequestContext,
): Promise<EmployeeResult> {
  assertPermission(session, "employee:manage");
  if (!(await isAssignableRole(input.roleId))) return { ok: false, reason: "invalid-role" };

  const pinHash = await hashSecret(input.pin);
  try {
    const id = await db.transaction(async (tx) => {
      const employeeId = await insertEmployee(tx, {
        username: input.username,
        name: input.name,
        roleId: input.roleId,
        pinHash,
      });
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "employee.created",
          entity: "user",
          entityId: employeeId,
          diff: { username: input.username, name: input.name, roleId: input.roleId },
        },
        context,
      );
      return employeeId;
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "username-taken" };
    throw error;
  }
}

/** Updates name and role; the owner account is managed only through config and seed (BR-01). */
export async function updateEmployee(
  session: Session,
  id: string,
  input: UpdateEmployeeInput,
  context: RequestContext,
): Promise<EmployeeResult> {
  assertPermission(session, "employee:manage");
  const current = await findEmployee(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (current.isOwner) return { ok: false, reason: "owner-protected" };
  if (input.roleId !== current.roleId && !(await isAssignableRole(input.roleId))) {
    return { ok: false, reason: "invalid-role" };
  }

  await db.transaction(async (tx) => {
    await updateEmployeeProfile(tx, id, input);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: "employee.updated",
        entity: "user",
        entityId: id,
        diff: {
          ...(current.name === input.name ? {} : { name: { from: current.name, to: input.name } }),
          ...(current.roleId === input.roleId
            ? {}
            : { roleId: { from: current.roleId, to: input.roleId } }),
        },
      },
      context,
    );
  });
  return { ok: true, id };
}

/**
 * Deactivates or reactivates an employee; accounts are never deleted
 * (FR-EMP-02, BR-04). Deactivation ends the employee's sessions at once.
 */
export async function changeEmployeeStatus(
  session: Session,
  id: string,
  isActive: boolean,
  context: RequestContext,
): Promise<EmployeeResult> {
  assertPermission(session, "employee:manage");
  const current = await findEmployee(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (current.isOwner) return { ok: false, reason: "owner-protected" };
  if (current.id === session.user.id) return { ok: false, reason: "self" };
  if (current.isActive === isActive) return { ok: true, id };

  await db.transaction(async (tx) => {
    await setEmployeeActive(tx, id, isActive);
    if (!isActive) await deleteUserSessions(tx, id);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: isActive ? "employee.activated" : "employee.deactivated",
        entity: "user",
        entityId: id,
      },
      context,
    );
  });
  return { ok: true, id };
}

/**
 * Sets a temporary PIN, unlocks the account and forces a PIN change at the
 * next login; existing sessions are ended (FR-AUTH-06).
 */
export async function resetEmployeePin(
  session: Session,
  id: string,
  input: ResetPinInput,
  context: RequestContext,
): Promise<EmployeeResult> {
  assertPermission(session, "employee:manage");
  const current = await findEmployee(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (current.isOwner) return { ok: false, reason: "owner-protected" };

  const pinHash = await hashSecret(input.pin);
  await db.transaction(async (tx) => {
    await setTemporaryPin(tx, id, pinHash);
    await deleteUserSessions(tx, id);
    await recordAudit(
      tx,
      { actorId: session.user.id, action: "employee.pin.reset", entity: "user", entityId: id },
      context,
    );
  });
  return { ok: true, id };
}
