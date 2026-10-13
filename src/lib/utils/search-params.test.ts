import { describe, expect, it } from "vitest";

import { historyPageOf } from "./search-params";

describe("historyPageOf (FR-STK-10, FR-ROL-03)", () => {
  it("reads a whole page number and falls back to 1", () => {
    expect(historyPageOf("3")).toBe(3);
    expect(historyPageOf(undefined)).toBe(1);
    expect(historyPageOf("0")).toBe(1);
    expect(historyPageOf("2.5")).toBe(1);
    expect(historyPageOf("abc")).toBe(1);
    expect(historyPageOf("1001")).toBe(1);
  });
});
