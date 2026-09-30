import { describe, expect, it } from "vitest";

import { recapPeriod } from "./schemas";

const TODAY = "2026-09-30";

describe("recap period (FR-RPT-06)", () => {
  it("defaults to today and steps one day", () => {
    expect(recapPeriod({}, TODAY)).toEqual({
      kind: "day",
      day: TODAY,
      from: TODAY,
      to: TODAY,
      previous: "2026-09-29",
      next: null,
    });
    expect(recapPeriod({ day: "2026-03-01" }, TODAY)).toMatchObject({
      previous: "2026-02-28",
      next: "2026-03-02",
    });
  });

  it("falls back to today for a future or invalid day", () => {
    expect(recapPeriod({ day: "2026-10-01" }, TODAY)).toMatchObject({ day: TODAY });
    expect(recapPeriod({ day: "kemarin" }, TODAY)).toMatchObject({ day: TODAY });
  });

  it("covers a whole month, stopping at today", () => {
    expect(recapPeriod({ month: "2026-02" }, TODAY)).toEqual({
      kind: "month",
      month: "2026-02",
      from: "2026-02-01",
      to: "2026-02-28",
      previous: "2026-01",
      next: "2026-03",
    });
    expect(recapPeriod({ month: "2026-12" }, "2026-12-05")).toMatchObject({
      to: "2026-12-05",
      next: null,
    });
    expect(recapPeriod({ month: "2027-01" }, TODAY)).toMatchObject({ month: "2026-09" });
    expect(recapPeriod({ month: "2026-13" }, TODAY)).toMatchObject({ kind: "day" });
  });
});
