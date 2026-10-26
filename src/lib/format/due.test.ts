import { describe, expect, it } from "vitest";

import { daysBetween, dueState } from "./due";

describe("due dates (FR-UI-11)", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-08-27", "2026-09-26")).toBe(30);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-09-26", "2026-09-26")).toBe(0);
  });

  it("marks due dates relative to today and ignores settled items", () => {
    expect(dueState(null, "2026-09-26", false)).toBe("none");
    expect(dueState("2026-09-25", "2026-09-26", false)).toBe("overdue");
    expect(dueState("2026-09-26", "2026-09-26", false)).toBe("today");
    expect(dueState("2026-10-01", "2026-09-26", false)).toBe("upcoming");
    expect(dueState("2026-09-01", "2026-09-26", true)).toBe("none");
  });
});
