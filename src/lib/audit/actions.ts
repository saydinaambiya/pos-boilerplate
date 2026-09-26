/** Audit actions; extend as modules land (PRD FR-AUD-02). */
export const auditActions = [
  "auth.login.succeeded",
  "auth.login.failed",
  "auth.login.locked",
  "auth.logout",
  "auth.pin.changed",
  "role.created",
  "role.updated",
  "role.activated",
  "role.deactivated",
  "employee.created",
  "employee.updated",
  "employee.activated",
  "employee.deactivated",
  "employee.pin.reset",
  "settings.updated",
  "bank-account.created",
  "bank-account.updated",
  "bank-account.activated",
  "bank-account.deactivated",
  "marketplace.created",
  "marketplace.updated",
  "marketplace.activated",
  "marketplace.deactivated",
  "category.created",
  "category.updated",
  "category.deleted",
  "product.created",
  "product.updated",
  "product.activated",
  "product.deactivated",
  "stock.moved",
] as const;

export type AuditAction = (typeof auditActions)[number];

/** Message key under `Audit.actions`; next-intl reserves `.` for nesting. */
export function auditActionMessageKey(action: AuditAction): string {
  return action.replace(/\./g, "_");
}
