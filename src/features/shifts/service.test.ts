import { describe, expect, it } from "vitest";

import { expectedCashOf, type ShiftTotals } from "./service";

function emptyTotals(): ShiftTotals {
  return {
    revenue: 0,
    salesCount: 0,
    voidCount: 0,
    byMethod: {},
    expenses: 0,
    deposited: 0,
    kasbonCollected: {},
    kasbonIssued: 0,
    salesHandovers: 0,
  };
}

describe("shifts expectedCashOf (ADR-0054)", () => {
  it("computes expected cash including carried cash, opening cash, sales, and handovers", () => {
    const shift = { carriedCash: 100_000, openingCash: 50_000 };
    const totals: ShiftTotals = {
      ...emptyTotals(),
      byMethod: { CASH: 200_000 },
      kasbonCollected: { CASH: 25_000 },
      salesHandovers: 150_000,
      expenses: 30_000,
      deposited: 100_000,
    };

    // 100k + 50k + 200k + 25k + 150k - 30k - 100k = 395_000
    expect(expectedCashOf(shift, totals)).toBe(395_000);
  });

  it("handles zero salesHandovers correctly", () => {
    const shift = { carriedCash: 0, openingCash: 100_000 };
    const totals: ShiftTotals = {
      ...emptyTotals(),
      salesHandovers: 0,
    };
    expect(expectedCashOf(shift, totals)).toBe(100_000);
  });
});
