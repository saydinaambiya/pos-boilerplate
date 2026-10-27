import { describe, expect, it } from "vitest";

import {
  purchaseCreateInput,
  purchaseExportQuery,
  purchaseListQuery,
  purchaseUpdateInput,
} from "./schemas";

const base = {
  companyName: "PT Kain Jaya",
  invoiceNo: "INV-001",
  total: 1_000_000,
  orderDate: "2026-09-01",
  dueDate: "2026-09-20",
  note: "",
};

describe("purchase schemas (FR-PRB-01/02/05)", () => {
  it("accepts a settled cash bill without a due date", () => {
    expect(
      purchaseCreateInput.safeParse({
        ...base,
        term: "CASH",
        paidNow: 0,
        method: "CASH",
        dueDate: null,
      }).success,
    ).toBe(true);
  });

  it("requires a due date while a credit bill still owes money", () => {
    const result = purchaseCreateInput.safeParse({
      ...base,
      term: "CREDIT",
      paidNow: 100_000,
      method: "TRANSFER",
      dueDate: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a due date before the PO date and a payment over the total", () => {
    expect(
      purchaseCreateInput.safeParse({
        ...base,
        dueDate: "2026-08-01",
        term: "CREDIT",
        paidNow: 0,
        method: "CASH",
      }).success,
    ).toBe(false);
    expect(
      purchaseCreateInput.safeParse({
        ...base,
        term: "CREDIT",
        paidNow: 2_000_000,
        method: "CASH",
      }).success,
    ).toBe(false);
  });

  it("keeps the same date rule when a bill is edited", () => {
    expect(purchaseUpdateInput.safeParse(base).success).toBe(true);
    expect(purchaseUpdateInput.safeParse({ ...base, dueDate: "2026-01-01" }).success).toBe(false);
  });

  it("parses query date range filters", () => {
    const query = purchaseListQuery.parse({
      from: "2026-09-01",
      to: "2026-09-30",
      filter: "all",
      q: "Kain",
      page: "2",
    });
    expect(query).toEqual({
      filter: "all",
      q: "Kain",
      from: "2026-09-01",
      to: "2026-09-30",
      page: 2,
      archived: undefined,
    });

    const invalidDates = purchaseListQuery.parse({
      from: "invalid",
      to: "",
    });
    expect(invalidDates.from).toBeUndefined();
    expect(invalidDates.to).toBeUndefined();
  });

  it("parses export query parameters", () => {
    const query = purchaseExportQuery.parse({
      from: "2026-09-01",
      to: "2026-09-30",
      filter: "settled",
      q: "Sumber",
      archived: "1",
      lang: "id",
    });
    expect(query).toEqual({
      filter: "settled",
      q: "Sumber",
      from: "2026-09-01",
      to: "2026-09-30",
      archived: "1",
      lang: "id",
    });
  });
});
