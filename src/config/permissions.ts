/**
 * Fixed permission catalog (PRD §2.2). Roles and their permission sets are
 * owner-managed data; the list of permissions itself only changes in code.
 * Format: `resource:action`; `page:*` entries gate menus and routes.
 */
export const permissions = [
  "page:dashboard",
  "page:pos",
  "page:online-orders",
  "page:consignments",
  "page:products",
  "page:stock",
  "page:cutting",
  "page:expenses",
  "page:employees",
  "page:vouchers",
  "page:kasbon",
  "page:approvals",
  "page:reports",
  "page:housekeeping",
  "page:settings",
  "page:audit",
  "brand:manage",
  "product:create",
  "product:update",
  "stock:adjust",
  "employee:manage",
  "role:manage",
  "settings:manage",
  "audit:view",
  "pos:item-discount",
  "pos:after-hours",
  "expense:record",
  "sale:void",
  "voucher:request",
  "kasbon:create",
  "kasbon:pay",
  "report:view",
  "cash:deposit",
  "order.online:update-status",
  "consignment:pickup",
  "consignment:return",
  "consignment:sell",
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

/**
 * Seeded, owner-editable roles for the goods salespeople carry (FR-CSG-01,
 * ADR-0024): Admin records pickups, Pramuniaga records returns, and Sales
 * sells what they carry, also after store hours (FR-SET-09). Sales keeps
 * a shift in the Sales menu and has no cashier, so it can only sell the
 * goods it carries (ADR-0029), and may sell them on store credit (ADR-0033).
 */
export const SEEDED_ROLES = [
  {
    name: "Admin",
    permissions: [
      "page:dashboard",
      "page:consignments",
      "page:stock",
      "consignment:pickup",
      "page:reports",
      "report:view",
      "cash:deposit",
    ],
  },
  {
    name: "Pramuniaga",
    permissions: ["page:dashboard", "page:consignments", "page:stock", "consignment:return"],
  },
  {
    name: "Sales",
    permissions: ["page:consignments", "consignment:sell", "pos:after-hours", "kasbon:create"],
  },
] as const satisfies readonly { name: string; permissions: readonly Permission[] }[];

/** Sections of the role permission matrix (FR-RBAC-01); each permission appears once. */
export const permissionGroups = {
  pages: [
    "page:dashboard",
    "page:pos",
    "page:online-orders",
    "page:consignments",
    "page:products",
    "page:stock",
    "page:cutting",
    "page:expenses",
    "page:employees",
    "page:vouchers",
    "page:kasbon",
    "page:approvals",
    "page:reports",
    "page:housekeeping",
    "page:settings",
    "page:audit",
  ],
  catalog: ["brand:manage", "product:create", "product:update", "stock:adjust"],
  sales: [
    "pos:item-discount",
    "pos:after-hours",
    "expense:record",
    "sale:void",
    "voucher:request",
    "kasbon:create",
    "kasbon:pay",
    "order.online:update-status",
    "consignment:pickup",
    "consignment:return",
    "consignment:sell",
    "report:view",
    "cash:deposit",
  ],
  approvals: ["approval.kasbon:decide", "approval.voucher:decide", "approval.void:decide"],
  administration: ["employee:manage", "role:manage", "settings:manage", "audit:view"],
} as const satisfies Record<string, readonly Permission[]>;

export type PermissionGroup = keyof typeof permissionGroups;

/** Message key under `Permissions` for a permission; next-intl reserves `.` for nesting. */
export function permissionMessageKey(permission: Permission): string {
  return permission.replace(/[.:]/g, "_");
}
