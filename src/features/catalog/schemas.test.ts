import { describe, expect, it } from "vitest";

import { changedFields } from "@/lib/audit/diff";
import { parseRupiah } from "@/lib/validation/money";

import { productFilters, productInput } from "./schemas";

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
    categoryId: "0199a000-0000-7000-8000-000000000001",
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

describe("productFilters", () => {
  it("falls back to defaults for invalid query values", () => {
    expect(
      productFilters.parse({ q: "  kopi ", category: "x", status: "deleted", page: "-2" }),
    ).toEqual({
      q: "kopi",
      category: undefined,
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
