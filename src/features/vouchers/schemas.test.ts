import { describe, expect, it } from "vitest";

import { displayStatusFor } from "./status";
import { createVoucherInput, voucherTermsInput } from "./schemas";

const base = {
  name: "Promo",
  type: "PERCENT" as const,
  value: 10,
  minPurchase: null,
  maxDiscount: null,
  startDate: null,
  endDate: null,
  quota: null,
};

describe("voucher terms (FR-VCH-01, FR-VCH-05)", () => {
  it("limits percentages to 1–100 and keeps the maximum discount for percentages only", () => {
    expect(voucherTermsInput.safeParse({ ...base, value: 100 }).success).toBe(true);
    expect(voucherTermsInput.safeParse({ ...base, value: 101 }).success).toBe(false);
    expect(voucherTermsInput.safeParse({ ...base, value: 0 }).success).toBe(false);
    expect(
      voucherTermsInput.safeParse({ ...base, type: "FIXED", value: 5000, maxDiscount: 1000 })
        .success,
    ).toBe(false);
    expect(voucherTermsInput.safeParse({ ...base, type: "FIXED", value: 250_000 }).success).toBe(
      true,
    );
  });

  it("rejects an end before the start and upper-cases codes", () => {
    expect(
      voucherTermsInput.safeParse({ ...base, startDate: "2026-10-02", endDate: "2026-10-01" })
        .success,
    ).toBe(false);
    expect(createVoucherInput.parse({ ...base, code: " hemat-10 " }).code).toBe("HEMAT-10");
    expect(createVoucherInput.safeParse({ ...base, code: "a b" }).success).toBe(false);
  });
});

describe("derived status (PRD §4.4)", () => {
  const now = new Date("2026-09-26T00:00:00Z");
  it("treats active vouchers outside their period as expired or scheduled", () => {
    expect(
      displayStatusFor("ACTIVE", { startsAt: null, endsAt: new Date("2026-09-25T00:00:00Z") }, now),
    ).toBe("EXPIRED");
    expect(
      displayStatusFor("ACTIVE", { startsAt: new Date("2026-10-01T00:00:00Z"), endsAt: null }, now),
    ).toBe("SCHEDULED");
    expect(displayStatusFor("ACTIVE", { startsAt: null, endsAt: null }, now)).toBe("ACTIVE");
    expect(
      displayStatusFor("INACTIVE", { startsAt: null, endsAt: new Date("2020-01-01") }, now),
    ).toBe("INACTIVE");
  });
});
