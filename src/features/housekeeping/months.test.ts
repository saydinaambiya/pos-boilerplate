import { describe, expect, it } from "vitest";

import { addMonths, archivableMonths, isMonth, latestArchivableMonth } from "./months";

describe("archivable months (FR-HK-01)", () => {
  it("keeps the retention period out of reach", () => {
    expect(latestArchivableMonth("2026-09-26", 3)).toBe("2026-06");
    expect(latestArchivableMonth("2026-01-01", 3)).toBe("2025-10");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });

  it("lists months newest first between the earliest data and the cutoff", () => {
    expect(archivableMonths("2026-04", "2026-06", 12)).toEqual(["2026-06", "2026-05", "2026-04"]);
    expect(archivableMonths("2020-01", "2026-06", 2)).toEqual(["2026-06", "2026-05"]);
    expect(archivableMonths("2026-07", "2026-06", 12)).toEqual([]);
    expect(archivableMonths(null, "2026-06", 12)).toEqual([]);
  });

  it("validates month strings", () => {
    expect(isMonth("2026-06")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-6")).toBe(false);
  });
});
