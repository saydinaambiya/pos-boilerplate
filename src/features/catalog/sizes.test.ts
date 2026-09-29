import { describe, expect, it } from "vitest";

import { PRODUCT_SIZES, productDetailsLine, ROLL_USAGE_CM, ROLL_WIDTH_CM } from "./sizes";

describe("roll sizes (FR-ROL-03)", () => {
  it("fits every size across the 140cm roll with the agreed usage", () => {
    expect(ROLL_USAGE_CM).toEqual({ "93x47": 47, "100x70": 50, "50x140": 50, "100x140": 100 });
    for (const size of PRODUCT_SIZES) {
      const [length = 0, width = 0] = size.split("x").map(Number);
      expect(Math.max(length, width), size).toBeLessThanOrEqual(ROLL_WIDTH_CM);
    }
  });

  it("lists brand, motif, thickness and size", () => {
    expect(
      productDetailsLine({ brandName: "Turkiye", motif: "Mihrab", thickness: 8, size: "93x47" }),
    ).toBe("Turkiye · Mihrab · 8mm · 93cm x 47cm");
    expect(productDetailsLine({ brandName: null, motif: null, thickness: 2.5 }, "en")).toBe(
      "2.5mm",
    );
  });
});
