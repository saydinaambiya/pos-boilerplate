import { describe, expect, it } from "vitest";

import { startOfNextZonedDay, startOfZonedDay } from "@/lib/format/zoned-time";

import { basisPointsToPercent, percentToBasisPoints } from "./rates";
import {
  operationsSchema,
  sampleInvoiceNumber,
  settingDefinitions,
  storeProfileSchema,
  taxSchema,
} from "./schemas";

describe("percent ↔ basis points (FR-SET-04)", () => {
  it("parses dot or comma decimals without floats", () => {
    expect(percentToBasisPoints("11")).toBe(1100);
    expect(percentToBasisPoints("11,5")).toBe(1150);
    expect(percentToBasisPoints("0.05")).toBe(5);
    expect(percentToBasisPoints("100")).toBe(10_000);
  });

  it("rejects malformed and out-of-range input", () => {
    for (const input of ["", "abc", "1.234", "-1", "100.01", "1e2"]) {
      expect(percentToBasisPoints(input), input).toBeNull();
    }
  });

  it("formats back to the shortest decimal", () => {
    expect(basisPointsToPercent(1100)).toBe("11");
    expect(basisPointsToPercent(1150)).toBe("11.5");
    expect(basisPointsToPercent(5)).toBe("0.05");
  });
});

describe("setting schemas (FR-SET)", () => {
  it("accept their own defaults", () => {
    for (const [key, definition] of Object.entries(settingDefinitions)) {
      expect(definition.schema.safeParse(definition.defaults).success, key).toBe(true);
    }
  });

  it("validate phone (E.164), NPWP and optional fields", () => {
    const base = settingDefinitions["store.profile"].defaults;
    expect(storeProfileSchema.safeParse({ ...base, phone: "+6281234567890" }).success).toBe(true);
    expect(storeProfileSchema.safeParse({ ...base, phone: "081234567890" }).success).toBe(false);
    expect(storeProfileSchema.safeParse({ ...base, npwp: "1234567890123456" }).success).toBe(true);
    expect(storeProfileSchema.safeParse({ ...base, npwp: "123" }).success).toBe(false);
  });

  it("require a rate when a charge is enabled", () => {
    const base = settingDefinitions.tax.defaults;
    expect(taxSchema.safeParse({ ...base, ppnEnabled: true, ppnRateBps: 0 }).success).toBe(false);
    expect(taxSchema.safeParse({ ...base, ppnEnabled: true, ppnRateBps: 1100 }).success).toBe(true);
  });

  it("keeps at least three months before housekeeping (BR-18)", () => {
    const base = settingDefinitions.operations.defaults;
    expect(operationsSchema.safeParse({ ...base, housekeepingRetentionMonths: 2 }).success).toBe(
      false,
    );
  });

  it("builds sample invoice numbers", () => {
    expect(sampleInvoiceNumber("INV-", 4, "20260926")).toBe("INV-20260926-0001");
  });
});

describe("store-time-zone days (FR-UI-11)", () => {
  it("converts calendar days to UTC instants", () => {
    expect(startOfZonedDay("2026-09-26", "Asia/Jakarta")?.toISOString()).toBe(
      "2026-09-25T17:00:00.000Z",
    );
    expect(startOfZonedDay("2026-09-26", "Asia/Jayapura")?.toISOString()).toBe(
      "2026-09-25T15:00:00.000Z",
    );
    expect(startOfNextZonedDay("2026-12-31", "Asia/Makassar")?.toISOString()).toBe(
      "2026-12-31T16:00:00.000Z",
    );
  });

  it("rejects impossible dates", () => {
    expect(startOfZonedDay("2026-02-30", "Asia/Jakarta")).toBeNull();
    expect(startOfZonedDay("26-09-2026", "Asia/Jakarta")).toBeNull();
  });
});
