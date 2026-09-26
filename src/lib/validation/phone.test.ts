import { describe, expect, it } from "vitest";

import { formatIndonesianPhone, indonesianPhone, normalizeIndonesianPhone } from "./phone";

describe("Indonesian mobile numbers (FR-KSB-01)", () => {
  it("normalises local and international forms", () => {
    expect(normalizeIndonesianPhone("0812-3456-7890")).toBe("+6281234567890");
    expect(normalizeIndonesianPhone("62 812 3456 789")).toBe("+628123456789");
    expect(normalizeIndonesianPhone("+6281234567")).toBe("+6281234567");
  });

  it("rejects landlines, short and foreign numbers", () => {
    expect(normalizeIndonesianPhone("021-5550123")).toBeNull();
    expect(normalizeIndonesianPhone("08123")).toBeNull();
    expect(normalizeIndonesianPhone("+6591234567")).toBeNull();
    expect(normalizeIndonesianPhone("0812345678901234")).toBeNull();
  });

  it("formats for display and reports why a value is invalid", () => {
    expect(formatIndonesianPhone("+6281234567890")).toBe("0812-3456-7890");
    expect(indonesianPhone.safeParse("").error?.issues[0]?.message).toBe("required");
    expect(indonesianPhone.safeParse("12").error?.issues[0]?.message).toBe("phone");
  });
});
