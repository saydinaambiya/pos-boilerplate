import { describe, expect, it } from "vitest";

import { stockMovementTypes } from "@/db/schema";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

import { countStockInput, movementFilters, writeOffStockInput } from "./schemas";

describe("stock inputs (FR-STK-05)", () => {
  it("requires a reason for counts and write-offs", () => {
    expect(countStockInput.safeParse({ counted: 3, reason: "  " }).success).toBe(false);
    expect(countStockInput.safeParse({ counted: 0, reason: "Opname" }).success).toBe(true);
    expect(writeOffStockInput.safeParse({ qty: 0, reason: "Rusak" }).success).toBe(false);
  });

  it("drops invalid history filters", () => {
    expect(movementFilters.parse({ type: "THEFT", from: "2026-02-30", cursor: "x" })).toEqual({
      type: undefined,
      from: undefined,
      to: undefined,
      cursor: undefined,
    });
  });
});

describe("movement type labels", () => {
  it("exist for every type in every locale", () => {
    for (const catalog of [id, en]) {
      const labels: Record<string, string> = catalog.Stock.types;
      for (const type of stockMovementTypes) expect(labels[type], type).toBeTruthy();
    }
  });
});
