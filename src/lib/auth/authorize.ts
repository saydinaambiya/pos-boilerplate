import type { Permission } from "@/config/permissions";

import type { Session } from "./session";

/** Thrown by services when the caller lacks a permission (NFR-SEC-07). */
export class ForbiddenError extends Error {
  constructor(readonly permission: Permission) {
    super(`Missing permission ${permission}`);
    this.name = "ForbiddenError";
  }
}

/**
 * Service-level check, repeated even when the page or action already
 * verified it: services are the one gate shared by UI and API (FR-RBAC-02).
 */
export function assertPermission(session: Session, permission: Permission): void {
  if (!session.permissions.has(permission)) throw new ForbiddenError(permission);
}

/** Like `assertPermission`, satisfied by any one of `permissions`. */
export function assertAnyPermission(session: Session, permissions: readonly Permission[]): void {
  const [first] = permissions;
  if (first === undefined) throw new Error("No permission given");
  if (!permissions.some((permission) => session.permissions.has(permission))) {
    throw new ForbiddenError(first);
  }
}
