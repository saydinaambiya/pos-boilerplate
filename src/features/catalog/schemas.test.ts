import { describe, expect, it } from "vitest";

import { changedFields } from "@/lib/audit/diff";
import { parseRupiah } from "@/lib/validation/money";

import { colorOf, hexColor, newProductInput, productFilters, productInput } from "./schemas";

describe("parseRupiah (PRD §5)", () => {
  it("accepts grouping in either locale and an Rp prefix", () => {
    expect(parseRupiah("15000")).toBe(15000);
    expect(parseRupiah("15.000")).toBe(15000);
    expect(parseRupiah("15,000")).toBe(15000);
    expect(parseRupiah("Rp 1.250.000")).toBe(1_250_000);
    expect(parseRupiah("0")).toBe(0);
  });

  it("rejects non-numbers, negatives and absurd amounts", () => {
    for (const input of ["", "abc", "-500", "12a", "1234567890123"]) {
      expect(parseRupiah(input), input).toBeNull();
    }
  });
});

describe("productInput (FR-PRD-01, NFR-SEC-02)", () => {
  const valid = {
    name: "Kopi Susu",
    price: 18000,
    unit: "cup",
    trackStock: false,
    sku: "KOPI-SUSU",
    minStock: 0,
  };

  it("accepts a product without cost (hidden from the editor)", () => {
    expect(productInput.safeParse(valid).success).toBe(true);
  });

  it("rejects bad SKUs, fractional money and unknown fields", () => {
    expect(productInput.safeParse({ ...valid, sku: "kopi susu" }).success).toBe(false);
    expect(productInput.safeParse({ ...valid, price: 1.5 }).success).toBe(false);
    expect(productInput.safeParse({ ...valid, stockQty: 99 }).success).toBe(false);
  });
});

describe("newProductInput (FR-PRD-06)", () => {
  const valid = {
    name: "Sajadah Turki",
    brandId: "0199a000-0000-7000-8000-000000000002",
    motif: "  Mihrab  ",
    size: "93x47",
    price: 150000,
    unit: "pcs",
    trackStock: true,
    sku: "SJD-9347",
    minStock: 0,
  };

  it("accepts a product with brand, motif and a known size", () => {
    expect(newProductInput.parse(valid)).toMatchObject({ motif: "Mihrab", size: "93x47" });
  });

  it("requires brand, motif and size and only knows the fixed sizes", () => {
    for (const field of ["brandId", "motif", "size"] as const) {
      const result = newProductInput.safeParse({ ...valid, [field]: "" });
      expect(result.error?.issues[0]?.code, field).toBe("too_small");
    }
    expect(newProductInput.safeParse({ ...valid, size: "90x40" }).success).toBe(false);
  });

  it("lets older products keep the details empty when edited", () => {
    expect(productInput.parse({ ...valid, brandId: "", motif: "", size: "" })).toMatchObject({
      brandId: null,
      motif: null,
      size: null,
    });
  });
});

describe("productFilters", () => {
  it("falls back to defaults for invalid query values", () => {
    expect(
      productFilters.parse({
        q: "  kopi ",
        brand: "x",
        size: "1x1",
        status: "deleted",
        page: "-2",
      }),
    ).toEqual({
      q: "kopi",
      brand: undefined,
      size: undefined,
      status: "active",
      page: 1,
    });
  });
});

describe("changedFields (FR-AUD-01)", () => {
  it("lists only fields whose value changed", () => {
    expect(changedFields({ price: 1000, name: "A" }, { price: 1200, name: "A" })).toEqual({
      price: { from: 1000, to: 1200 },
    });
  });
});

describe("colour variants (FR-VAR-03)", () => {
  it("accepts only strict six-digit hex swatches", () => {
    expect(hexColor.safeParse("#1E88e5").success).toBe(true);
    for (const value of ["#FFF", "1E88E5", "#1E88E5;", "red", "url(#x)", "#1E88E5 "]) {
      expect(hexColor.safeParse(value).success, value).toBe(false);
    }
  });

  it("reads colours from attributes and ignores the hidden default", () => {
    expect(colorOf({ color: { name: "Merah", hex: "#E53935" } })).toEqual({
      name: "Merah",
      hex: "#E53935",
    });
    expect(colorOf({})).toBeNull();
    expect(colorOf({ color: { name: "X", hex: "javascript:1" } })).toBeNull();
  });
});
