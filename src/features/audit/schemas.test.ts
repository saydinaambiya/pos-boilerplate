import { describe, expect, it } from "vitest";

import { auditActionMessageKey, auditActions } from "@/lib/audit/actions";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

import { parseAuditFilters } from "./schemas";

describe("parseAuditFilters (FR-AUD-03)", () => {
  it("keeps valid filters and drops invalid ones", () => {
    expect(
      parseAuditFilters({
        actor: "0199a000-0000-7000-8000-000000000001",
        action: "auth.logout",
        from: "2026-09-01",
        to: ["2026-09-30", "ignored"],
        cursor: "not-a-uuid",
        extra: "x",
      }),
    ).toEqual({
      actor: "0199a000-0000-7000-8000-000000000001",
      action: "auth.logout",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(parseAuditFilters({ action: "drop.table", from: "" })).toEqual({});
  });
});

describe("audit action labels", () => {
  it("exist for every action in every locale", () => {
    for (const catalog of [id, en]) {
      const labels: Record<string, string> = catalog.Audit.actions;
      for (const action of auditActions) {
        expect(labels[auditActionMessageKey(action)], action).toBeTruthy();
      }
    }
  });
});
