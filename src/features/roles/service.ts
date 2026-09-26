import "server-only";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { recordAudit } from "@/lib/audit/audit";
import { assertPermission } from "@/lib/auth/authorize";
import type { Session } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

import {
  countActiveMembers,
  findRole,
  insertRole,
  listAssignableRoles,
  listRoles,
  renameRole,
  replacePermissions,
  setRoleActive,
} from "./repository";
import type { RoleInput } from "./schemas";

export type RoleResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not-found" | "name-taken" | "system-role" | "role-in-use" };

export async function getRoles(session: Session) {
  assertPermission(session, "role:manage");
  return listRoles();
}

export async function getRole(session: Session, id: string) {
  assertPermission(session, "role:manage");
  return findRole(id);
}

/** Roles offered when creating or editing an employee. */
export async function getAssignableRoles(session: Session) {
  assertPermission(session, "employee:manage");
  return listAssignableRoles();
}

/**
 * Whether an employee may be given this role. Internal: callers have already
 * authorised the surrounding operation.
 */
export async function isAssignableRole(roleId: string): Promise<boolean> {
  return (await listAssignableRoles()).some((role) => role.id === roleId);
}

/** Creates a role with its permission set (FR-RBAC-01); audited. */
export async function createRole(
  session: Session,
  input: RoleInput,
  context: RequestContext,
): Promise<RoleResult> {
  assertPermission(session, "role:manage");
  try {
    const id = await db.transaction(async (tx) => {
      const roleId = await insertRole(tx, input.name);
      await replacePermissions(tx, roleId, input.permissions);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "role.created",
          entity: "role",
          entityId: roleId,
          diff: { name: input.name, permissions: input.permissions },
        },
        context,
      );
      return roleId;
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

/**
 * Renames a role and replaces its permissions. Changes apply to members on
 * their next request (FR-RBAC-03). The Owner role is immutable (PRD §2.2).
 */
export async function updateRole(
  session: Session,
  id: string,
  input: RoleInput,
  context: RequestContext,
): Promise<RoleResult> {
  assertPermission(session, "role:manage");
  const current = await findRole(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (current.isSystem) return { ok: false, reason: "system-role" };

  const before = new Set<string>(current.permissions);
  const after = new Set<string>(input.permissions);
  const added = input.permissions.filter((permission) => !before.has(permission));
  const removed = current.permissions.filter((permission) => !after.has(permission));

  try {
    await db.transaction(async (tx) => {
      if (current.name !== input.name) await renameRole(tx, id, input.name);
      await replacePermissions(tx, id, input.permissions);
      await recordAudit(
        tx,
        {
          actorId: session.user.id,
          action: "role.updated",
          entity: "role",
          entityId: id,
          diff: {
            ...(current.name === input.name
              ? {}
              : { name: { from: current.name, to: input.name } }),
            added,
            removed,
          },
        },
        context,
      );
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

/**
 * Activates or deactivates a role. A role still assigned to active
 * employees cannot be deactivated, so nobody silently loses all access.
 */
export async function changeRoleStatus(
  session: Session,
  id: string,
  isActive: boolean,
  context: RequestContext,
): Promise<RoleResult> {
  assertPermission(session, "role:manage");
  const current = await findRole(id);
  if (!current) return { ok: false, reason: "not-found" };
  if (current.isSystem) return { ok: false, reason: "system-role" };
  if (!isActive && (await countActiveMembers(id)) > 0) return { ok: false, reason: "role-in-use" };
  if (current.isActive === isActive) return { ok: true, id };

  await db.transaction(async (tx) => {
    await setRoleActive(tx, id, isActive);
    await recordAudit(
      tx,
      {
        actorId: session.user.id,
        action: isActive ? "role.activated" : "role.deactivated",
        entity: "role",
        entityId: id,
      },
      context,
    );
  });
  return { ok: true, id };
}
