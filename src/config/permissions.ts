/**
 * Fixed permission catalog (PRD §2.2). Roles and their permission sets are
 * owner-managed data; the list of permissions itself only changes in code.
 * Format: `resource:action`; `page:*` entries gate menus and routes.
 */
export const permissions = [
  "page:dashboard",
  "page:pos",
  "page:online-orders",
  "page:products",
  "page:stock",
  "page:employees",
  "page:vouchers",
  "page:kasbon",
  "page:approvals",
  "page:reports",
  "page:housekeeping",
  "page:settings",
  "page:audit",
  "category:manage",
  "product:create",
  "product:update",
  "product:view-cost",
  "stock:adjust",
  "employee:manage",
  "role:manage",
  "settings:manage",
  "audit:view",
  "voucher:request",
  "report:view",
  "order.online:update-status",
  "approval.kasbon:decide",
  "approval.voucher:decide",
  "approval.void:decide",
] as const;

export type Permission = (typeof permissions)[number];

export function isPermission(value: string): value is Permission {
  return (permissions as readonly string[]).includes(value);
}

/** Name of the system role that implicitly holds every permission (BR-01). */
export const OWNER_ROLE_NAME = "Owner";

/** Seeded, owner-editable role for cashiers (PRD §2.2). */
export const DEFAULT_EMPLOYEE_ROLE = {
  name: "Karyawan",
  permissions: ["page:dashboard", "page:pos", "page:online-orders", "page:products", "page:stock"],
} as const satisfies { name: string; permissions: readonly Permission[] };

/** Sections of the role permission matrix (FR-RBAC-01); each permission appears once. */
export const permissionGroups = {
  pages: [
    "page:dashboard",
    "page:pos",
    "page:online-orders",
    "page:products",
    "page:stock",
    "page:employees",
    "page:vouchers",
    "page:kasbon",
    "page:approvals",
    "page:reports",
    "page:housekeeping",
    "page:settings",
    "page:audit",
  ],
  catalog: [
    "category:manage",
    "product:create",
    "product:update",
    "product:view-cost",
    "stock:adjust",
  ],
  sales: ["voucher:request", "order.online:update-status", "report:view"],
  approvals: ["approval.kasbon:decide", "approval.voucher:decide", "approval.void:decide"],
  administration: ["employee:manage", "role:manage", "settings:manage", "audit:view"],
} as const satisfies Record<string, readonly Permission[]>;

export type PermissionGroup = keyof typeof permissionGroups;

/** Message key under `Permissions` for a permission; next-intl reserves `.` for nesting. */
export function permissionMessageKey(permission: Permission): string {
  return permission.replace(/[.:]/g, "_");
}
