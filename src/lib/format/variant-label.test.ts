import { describe, expect, it } from "vitest";

import {
  brandedName,
  detailsWithoutBrand,
  goodsName,
  stockItemLabel,
  traitsLine,
  variantLabel,
} from "./variant-label";

describe("brand beside the product name (FR-PRD-08)", () => {
  it("puts the brand before the name when there is one", () => {
    expect(brandedName("Karpet Mihrab", "Fox")).toBe("Fox · Karpet Mihrab");
    expect(brandedName("Karpet Mihrab", null)).toBe("Karpet Mihrab");
    expect(brandedName("Karpet Mihrab")).toBe("Karpet Mihrab");
  });

  it("names variants, stock rows and goods with their brand", () => {
    expect(variantLabel("Karpet", "Merah", "Fox")).toBe("Fox · Karpet · Merah");
    expect(variantLabel("Karpet", null)).toBe("Karpet");
    expect(
      stockItemLabel({
        productName: "Karpet",
        brandName: "Fox",
        colorName: "Merah",
        size: "93x47",
        isRoll: false,
      }),
    ).toBe("Fox · Karpet · Merah · 93cm x 47cm");
    expect(goodsName({ name: "Karpet", brandName: "Fox", size: null, isDefect: true })).toBe(
      "Fox · Karpet · Cacat",
    );
  });

  it("drops a leading brand from a frozen details line", () => {
    expect(detailsWithoutBrand("Fox · Mihrab · 8 mm", "Fox")).toBe("Mihrab · 8 mm");
    expect(detailsWithoutBrand("Fox", "Fox")).toBeNull();
    expect(detailsWithoutBrand("Mihrab · 8 mm", "Fox")).toBe("Mihrab · 8 mm");
    expect(detailsWithoutBrand("Foxy · Mihrab", "Fox")).toBe("Foxy · Mihrab");
    expect(detailsWithoutBrand(null, "Fox")).toBeNull();
    expect(detailsWithoutBrand("Fox · Mihrab", null)).toBe("Fox · Mihrab");
  });
});

describe("motif and thickness beside goods (FR-PRD-08)", () => {
  const labels = { motif: "Motif", thickness: "Ketebalan" };

  it("labels each detail and skips the missing ones", () => {
    expect(traitsLine({ motif: "Mihrab", thickness: 8 }, labels, "id")).toBe(
      "Motif: Mihrab · Ketebalan: 8mm",
    );
    expect(traitsLine({ motif: null, thickness: 2.5 }, labels, "id")).toBe("Ketebalan: 2,5mm");
    expect(traitsLine({ motif: "Bunga" }, labels, "id")).toBe("Motif: Bunga");
    expect(traitsLine({}, labels, "id")).toBe("");
  });
});
