import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import id from "@/messages/id.json";

import { navigation } from "./navigation";
import {
  DEFAULT_EMPLOYEE_ROLE,
  isPermission,
  permissionGroups,
  permissionMessageKey,
  permissions,
} from "./permissions";

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

  it("gates every production menu entry but home with a page permission", () => {
    for (const item of navigation.filter((entry) => !entry.diagnostics && entry.href !== "/")) {
      expect(item.permission, item.href).toMatch(/^page:/);
    }
    expect(navigation.find((entry) => entry.href === "/")?.permission).toBeUndefined();
  });

  it("does not give the default employee role management permissions", () => {
    expect(DEFAULT_EMPLOYEE_ROLE.permissions.every((p) => p.startsWith("page:"))).toBe(true);
    expect(DEFAULT_EMPLOYEE_ROLE.permissions).not.toContain("page:settings");
  });

  it("places every permission in exactly one matrix group (FR-RBAC-01)", () => {
    const grouped = Object.values(permissionGroups).flat();
    expect(grouped.length).toBe(new Set(grouped).size);
    expect([...grouped].sort()).toEqual([...permissions].sort());
  });

  it("has a label for every permission in every locale", () => {
    for (const catalog of [id, en]) {
      const labels: Record<string, string> = catalog.Permissions.labels;
      for (const permission of permissions) {
        expect(labels[permissionMessageKey(permission)], permission).toBeTruthy();
      }
      expect(Object.keys(labels).length).toBe(permissions.length);
    }
  });
});
