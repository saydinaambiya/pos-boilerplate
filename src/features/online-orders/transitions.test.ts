import { describe, expect, it } from "vitest";

import { canTransition, isHeld, transitionNeeds } from "./transitions";

describe("online order state machine (PRD §4.2)", () => {
  it("allows only the documented changes", () => {
    expect(canTransition("PROCESSING", "IN_TRANSIT")).toBe(true);
    expect(canTransition("PROCESSING", "CANCELLED")).toBe(true);
    expect(canTransition("IN_TRANSIT", "CANCELLED")).toBe(false);
    expect(canTransition("DELIVERED", "RETURN_REQUESTED")).toBe(false);
    expect(canTransition("COMPLAINT", "RETURN_REQUESTED")).toBe(true);
    expect(canTransition("RETURNED", "COMPLETED")).toBe(false);
  });

  it("asks for a note, a resolution or return conditions where needed", () => {
    expect(transitionNeeds("DELIVERED", "COMPLAINT")).toEqual({
      complaintNote: true,
      resolution: false,
      returnConditions: false,
    });
    expect(transitionNeeds("COMPLAINT", "COMPLETED").resolution).toBe(true);
    expect(transitionNeeds("DELIVERED", "COMPLETED").resolution).toBe(false);
    expect(transitionNeeds("RETURN_REQUESTED", "RETURNED").returnConditions).toBe(true);
  });

  it("flags open orders untouched past the threshold (FR-ONL-07)", () => {
    const now = new Date("2026-09-26T12:00:00Z");
    const changed = new Date("2026-09-24T11:00:00Z");
    expect(isHeld("IN_TRANSIT", changed, 48, now)).toBe(true);
    expect(isHeld("IN_TRANSIT", changed, 50, now)).toBe(false);
    expect(isHeld("COMPLETED", changed, 1, now)).toBe(false);
  });
});
