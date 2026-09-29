import { describe, expect, it } from "vitest";

import { changedFields } from "@/lib/audit/diff";
import { parseRupiah } from "@/lib/validation/money";

import {
  colorOf,
  hexColor,
  newProductInput,
  productFilters,
  productInput,
  variantSnapshotOf,
} from "./schemas";

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

describe("newProductInput (FR-PRD-06, FR-ROL-02)", () => {
  const sizePrices = { "93x47": 150000, "100x70": 180000, "50x140": 175000, "100x140": 320000 };
  const valid = {
    name: "Karpet Turki",
    brandId: "0199a000-0000-7000-8000-000000000002",
    colorName: "Red",
    motif: "3D Catur",
    thickness: 2.5,
    sizePrices,
    defectSizePrices: sizePrices,
    price: 300000,
    unit: "pcs",
    trackStock: true,
    sku: "KRP-TRK",
    minStock: 1000,
  };

  it("accepts a roll with brand, motif, thickness and a price per size", () => {
    expect(newProductInput.parse(valid)).toMatchObject({ motif: "3D Catur", thickness: 2.5 });
    expect(newProductInput.safeParse({ ...valid, colorName: "Merah" }).success).toBe(false);
    for (const motif of ["Mihrab", "3D", "Catur"]) {
      expect(newProductInput.safeParse({ ...valid, motif }).success, motif).toBe(false);
    }
  });

  it("requires brand and motif, a positive thickness and every size price", () => {
    for (const field of ["brandId", "motif"] as const) {
      const result = newProductInput.safeParse({ ...valid, [field]: "" });
      expect(result.error?.issues[0]?.code, field).toBe("too_small");
    }
    for (const thickness of [0, -1, 1.005, Number.NaN, null]) {
      expect(newProductInput.safeParse({ ...valid, thickness }).success, String(thickness)).toBe(
        false,
      );
    }
    const missing: Partial<typeof sizePrices> = { ...sizePrices };
    delete missing["100x140"];
    expect(newProductInput.safeParse({ ...valid, sizePrices: missing }).success).toBe(false);
    expect(
      newProductInput.safeParse({ ...valid, sizePrices: { ...sizePrices, "90x40": 1 } }).success,
    ).toBe(false);
  });

  it("keeps room in a roll SKU for the piece suffix", () => {
    expect(newProductInput.safeParse({ ...valid, sku: "A".repeat(32) }).success).toBe(true);
    expect(newProductInput.safeParse({ ...valid, sku: "A".repeat(33) }).success).toBe(false);
  });

  it("requires a defect price for every size (FR-ROL-05)", () => {
    expect(newProductInput.safeParse({ ...valid, defectSizePrices: undefined }).success).toBe(
      false,
    );
  });

  it("lets older products keep the details empty when edited", () => {
    expect(
      productInput.parse({
        name: valid.name,
        price: valid.price,
        unit: valid.unit,
        trackStock: valid.trackStock,
        sku: valid.sku,
        minStock: valid.minStock,
        brandId: "",
        motif: "",
        thickness: null,
      }),
    ).toMatchObject({ brandId: null, motif: null, thickness: null });
  });
});

describe("productFilters", () => {
  it("falls back to defaults for invalid query values", () => {
    expect(
      productFilters.parse({
        q: "  kopi ",
        brand: "x",
        status: "deleted",
        page: "-2",
      }),
    ).toEqual({
      q: "kopi",
      brand: undefined,
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

  it("names a piece by its colour, size and defect flag (ADR-0023, FR-ROL-05)", () => {
    expect(variantSnapshotOf({ color: { name: "Red" } }, "93x47", true)).toBe(
      "Red · 93cm x 47cm · Cacat",
    );
    expect(variantSnapshotOf({ color: { name: "Merah" } }, "93x47")).toBe("Merah · 93cm x 47cm");
    expect(variantSnapshotOf({}, "100x140")).toBe("100cm x 140cm");
    expect(variantSnapshotOf({}, null)).toBeNull();
  });
});
