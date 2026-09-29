import { describe, expect, it } from "vitest";

import { cutPrice } from "./cut";

describe("cutPrice (FR-ROL-04)", () => {
  it("keeps whole-unit prices and prices a cut by its length", () => {
    expect(cutPrice(150000, undefined)).toBe(150000);
    expect(cutPrice(100000, 90)).toBe(90000);
    expect(cutPrice(85550, 150)).toBe(128325);
    expect(cutPrice(33333, 1)).toBe(333);
  });
});
