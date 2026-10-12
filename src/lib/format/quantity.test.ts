import { describe, expect, it } from "vitest";

import { formatStock, parseStock, stockInputValue, stockMeasure } from "./quantity";

describe("stock quantities (ADR-0023, ADR-0045)", () => {
  it("counts rolls in meters, kg goods in kg and the rest in whole units", () => {
    expect(stockMeasure({ isRoll: true, unit: "pcs" })).toBe("meter");
    expect(stockMeasure({ isRoll: false, unit: "kg" })).toBe("kg");
    expect(stockMeasure({ isRoll: false, unit: "ml" })).toBe("count");
  });

  it("reads typed kg as grams with up to three decimals", () => {
    expect(parseStock("kg", "0,5")).toBe(500);
    expect(parseStock("kg", "2.125")).toBe(2125);
    expect(parseStock("kg", "1,2345")).toBeNull();
    expect(parseStock("meter", "1,5")).toBe(150);
    expect(parseStock("count", "250")).toBe(250);
    expect(parseStock("count", "2,5")).toBeNull();
  });

  it("shows grams as kg in the user's locale", () => {
    expect(formatStock("kg", 2500, "id")).toBe("2,5kg");
    expect(formatStock("kg", 125, "en")).toBe("0.125kg");
    expect(formatStock("count", 250, "id")).toBe("250");
    expect(stockInputValue("kg", 1500, "id")).toBe("1,5");
  });
});
