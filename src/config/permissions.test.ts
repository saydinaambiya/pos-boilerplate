import { describe, expect, it } from "vitest";

import { navigation } from "./navigation";
import { DEFAULT_EMPLOYEE_ROLE, isPermission, permissions } from "./permissions";

describe("permission catalog (PRD §2.2)", () => {
  it("has unique resource:action entries", () => {
    expect(new Set(permissions).size).toBe(permissions.length);
    for (const permission of permissions) expect(permission).toMatch(/^[a-z.-]+:[a-z-]+$/);
  });

  it("keeps approval permissions separate per type (BR-21)", () => {
    for (const type of ["kasbon", "voucher", "void"]) {
      expect(isPermission(`approval.${type}:decide`)).toBe(true);
    }
  });

  it("gates every production menu entry with a page permission", () => {
    for (const item of navigation.filter((entry) => !entry.diagnostics)) {
      expect(item.permission, item.href).toMatch(/^page:/);
    }
  });

  it("does not give the default employee role management permissions", () => {
    expect(DEFAULT_EMPLOYEE_ROLE.permissions.every((p) => p.startsWith("page:"))).toBe(true);
    expect(DEFAULT_EMPLOYEE_ROLE.permissions).not.toContain("page:settings");
  });
});
