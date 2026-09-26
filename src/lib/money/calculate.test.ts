import { describe, expect, it } from "vitest";

import {
  applyRate,
  calculateSale,
  lineTotals,
  removeRate,
  type TaxRules,
  voucherDiscount,
} from "./calculate";

const noTax: TaxRules = {
  ppnEnabled: false,
  ppnRateBps: 0,
  serviceEnabled: false,
  serviceRateBps: 0,
  priceIncludesTax: false,
};
const ppn11: TaxRules = { ...noTax, ppnEnabled: true, ppnRateBps: 1100 };

describe("rate helpers (half-up, integer)", () => {
  it("rounds half up", () => {
    expect(applyRate(150, 1000)).toBe(15);
    expect(applyRate(155, 1000)).toBe(16);
    expect(applyRate(154, 1000)).toBe(15);
    expect(applyRate(5, 1000)).toBe(1);
    expect(applyRate(4, 1000)).toBe(0);
  });

  it("stays exact for billion-rupiah amounts", () => {
    expect(applyRate(999_999_999_999, 1100)).toBe(110_000_000_000);
    expect(applyRate(999_999_999_999, 10_000)).toBe(999_999_999_999);
  });

  it("removes an inclusive rate", () => {
    expect(removeRate(111_000, 1100)).toBe(100_000);
    expect(removeRate(10_000, 1100)).toBe(9009);
    expect(removeRate(0, 1100)).toBe(0);
  });

  it("rejects negative inputs", () => {
    expect(() => applyRate(-1, 100)).toThrow(RangeError);
    expect(() => removeRate(1, -100)).toThrow(RangeError);
  });
});

describe("lineTotals (PRD §5 step 1, BR-08)", () => {
  it("multiplies price by quantity", () => {
    expect(lineTotals({ unitPrice: 12_500, qty: 3 })).toEqual({
      gross: 37_500,
      discount: 0,
      total: 37_500,
    });
  });

  it("applies percentage discounts per line, not per unit", () => {
    expect(
      lineTotals({ unitPrice: 3333, qty: 3, discount: { type: "percent", bps: 1000 } }),
    ).toEqual({
      gross: 9999,
      discount: 1000,
      total: 8999,
    });
  });

  it("never lets a discount exceed the line", () => {
    expect(
      lineTotals({ unitPrice: 5000, qty: 1, discount: { type: "amount", value: 9000 } }).total,
    ).toBe(0);
    expect(
      lineTotals({ unitPrice: 5000, qty: 1, discount: { type: "percent", bps: 20_000 } }).total,
    ).toBe(0);
    expect(
      lineTotals({ unitPrice: 5000, qty: 1, discount: { type: "amount", value: -10 } }).discount,
    ).toBe(0);
  });
});

describe("voucherDiscount (BR-09)", () => {
  it("respects minimum purchase and maximum discount", () => {
    expect(voucherDiscount(90_000, { type: "percent", value: 1000, minPurchase: 100_000 })).toBe(0);
    expect(voucherDiscount(100_000, { type: "percent", value: 1000, minPurchase: 100_000 })).toBe(
      10_000,
    );
    expect(voucherDiscount(500_000, { type: "percent", value: 2000, maxDiscount: 50_000 })).toBe(
      50_000,
    );
  });

  it("never exceeds the subtotal", () => {
    expect(voucherDiscount(20_000, { type: "amount", value: 25_000 })).toBe(20_000);
    expect(voucherDiscount(0, { type: "amount", value: 5000 })).toBe(0);
    expect(voucherDiscount(10_000, null)).toBe(0);
  });
});

describe("calculateSale (PRD §5)", () => {
  const lines = [
    { unitPrice: 25_000, qty: 2 },
    { unitPrice: 15_000, qty: 1, discount: { type: "amount", value: 5000 } as const },
  ];

  it("totals without taxes", () => {
    const totals = calculateSale(lines, noTax);
    expect(totals).toMatchObject({
      subtotal: 60_000,
      itemDiscountTotal: 5000,
      net: 60_000,
      serviceAmount: 0,
      ppnAmount: 0,
      grandTotal: 60_000,
    });
  });

  it("follows the exclusive order: voucher, service, then PPN on net + service", () => {
    const totals = calculateSale(
      lines,
      { ...ppn11, serviceEnabled: true, serviceRateBps: 500 },
      { type: "amount", value: 10_000 },
    );
    expect(totals).toMatchObject({
      subtotal: 60_000,
      voucherDiscount: 10_000,
      net: 50_000,
      serviceAmount: 2500,
      taxBase: 52_500,
      ppnAmount: 5775,
      grandTotal: 58_275,
    });
  });

  it("keeps the shelf price as the total for inclusive PPN without service", () => {
    const totals = calculateSale([{ unitPrice: 10_000, qty: 1 }], {
      ...ppn11,
      priceIncludesTax: true,
    });
    expect(totals).toMatchObject({ taxBase: 9009, ppnAmount: 991, grandTotal: 10_000 });
    expect(totals.taxBase + totals.ppnAmount).toBe(totals.grandTotal);
  });

  it("adds service and its PPN on top of inclusive prices", () => {
    const totals = calculateSale([{ unitPrice: 111_000, qty: 1 }], {
      ...ppn11,
      priceIncludesTax: true,
      serviceEnabled: true,
      serviceRateBps: 1000,
    });
    expect(totals).toMatchObject({
      net: 111_000,
      serviceAmount: 10_000,
      taxBase: 110_000,
      ppnAmount: 12_100,
      grandTotal: 122_100,
    });
  });

  it("ignores the inclusive flag when PPN is off and handles an empty cart", () => {
    expect(calculateSale(lines, { ...noTax, priceIncludesTax: true }).grandTotal).toBe(60_000);
    expect(calculateSale([], ppn11).grandTotal).toBe(0);
  });

  it("keeps the exclusive identity grand = net + service + ppn for many carts", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const cart = Array.from({ length: (seed % 5) + 1 }, (_, index) => ({
        unitPrice: ((seed * 7919 + index * 104_729) % 500_000) + 1,
        qty: ((seed + index) % 4) + 1,
        discount: index % 2 === 0 ? ({ type: "percent", bps: (seed * 37) % 5000 } as const) : null,
      }));
      const totals = calculateSale(cart, { ...ppn11, serviceEnabled: true, serviceRateBps: 750 });
      expect(totals.grandTotal).toBe(totals.net + totals.serviceAmount + totals.ppnAmount);
      expect(totals.subtotal).toBe(totals.lines.reduce((sum, line) => sum + line.total, 0));
      expect(totals.grandTotal).toBeGreaterThanOrEqual(totals.net);
    }
  });
});
