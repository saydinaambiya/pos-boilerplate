import { describe, expect, it } from "vitest";

import { agingBucket, daysBetween, dueState, storeDate } from "./aging";

describe("store credit aging (FR-KSB-06)", () => {
  it("buckets by whole store days", () => {
    expect(agingBucket(0)).toBe("current");
    expect(agingBucket(30)).toBe("current");
    expect(agingBucket(31)).toBe("days31to60");
    expect(agingBucket(60)).toBe("days31to60");
    expect(agingBucket(61)).toBe("over60");
  });

  it("counts calendar days in the store time zone", () => {
    const lateNightUtc = new Date("2026-09-25T18:30:00Z");
    expect(storeDate(lateNightUtc, "Asia/Jakarta")).toBe("2026-09-26");
    expect(daysBetween("2026-08-27", "2026-09-26")).toBe(30);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("marks due dates relative to today and ignores settled credit", () => {
    expect(dueState(null, "2026-09-26", false)).toBe("none");
    expect(dueState("2026-09-25", "2026-09-26", false)).toBe("overdue");
    expect(dueState("2026-09-26", "2026-09-26", false)).toBe("today");
    expect(dueState("2026-10-01", "2026-09-26", false)).toBe("upcoming");
    expect(dueState("2026-09-01", "2026-09-26", true)).toBe("none");
  });
});
