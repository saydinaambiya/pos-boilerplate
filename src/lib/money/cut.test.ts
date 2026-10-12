import { describe, expect, it } from "vitest";

import { cutPrice, weighPrice } from "./cut";

describe("cutPrice (FR-ROL-04)", () => {
  it("keeps whole-unit prices and prices a cut by its length", () => {
    expect(cutPrice(150000, undefined)).toBe(150000);
    expect(cutPrice(100000, 90)).toBe(90000);
    expect(cutPrice(85550, 150)).toBe(128325);
    expect(cutPrice(33333, 1)).toBe(333);
  });
});

describe("weighPrice (ADR-0045)", () => {
  it("prices a weighed line per kg, rounded to whole rupiah", () => {
    expect(weighPrice(45_000, undefined)).toBe(45_000);
    expect(weighPrice(45_000, 500)).toBe(22_500);
    expect(weighPrice(33_333, 125)).toBe(4167);
  });
});
