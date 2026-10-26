import { describe, expect, it } from "vitest";

import { purchaseCreateInput, purchaseUpdateInput } from "./schemas";

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
});
