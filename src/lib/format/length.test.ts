import { describe, expect, it } from "vitest";

import { formatMeters, formatThickness, parseDecimal, parseMetersToCm } from "./length";

describe("lengths and thickness (FR-PRD-06, ADR-0023)", () => {
  it("reads decimals with a comma or a dot", () => {
    expect(parseDecimal("2,5")).toBe(2.5);
    expect(parseDecimal(" 2.25 ")).toBe(2.25);
    expect(parseDecimal("40")).toBe(40);
    for (const input of ["", "1.234,5", "2,555", "-1", "1e3", "abc"]) {
      expect(parseDecimal(input), input).toBeNull();
    }
    expect(parseDecimal("90", 0)).toBe(90);
    expect(parseDecimal("90,5", 0)).toBeNull();
  });

  it("turns typed meters into whole centimetres", () => {
    expect(parseMetersToCm("1,5")).toBe(150);
    expect(parseMetersToCm("38.47")).toBe(3847);
    expect(parseMetersToCm("0,1")).toBe(10);
    expect(parseMetersToCm("x")).toBeNull();
  });

  it("formats meters and millimetres per locale", () => {
    expect(formatMeters(3850, "id")).toBe("38,5m");
    expect(formatMeters(3850, "en")).toBe("38.5m");
    expect(formatMeters(-47, "id")).toBe("-0,47m");
    expect(formatThickness(2.5, "id")).toBe("2,5mm");
    expect(formatThickness(8, "en")).toBe("8mm");
  });
});
