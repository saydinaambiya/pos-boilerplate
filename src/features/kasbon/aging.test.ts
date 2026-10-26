import { describe, expect, it } from "vitest";

import { agingBucket, storeDate } from "./aging";

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
  });
});
