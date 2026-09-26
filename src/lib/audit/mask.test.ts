import { describe, expect, it } from "vitest";

import { maskSensitive, REDACTED } from "./mask";

describe("maskSensitive (FR-AUD-01)", () => {
  it("redacts secrets at any depth", () => {
    expect(
      maskSensitive({
        username: "kasir",
        pin: "123456",
        passwordHash: "$argon2id$...",
        nested: [{ token: "abc", newPin: "654321", note: "ok" }],
      }),
    ).toEqual({
      username: "kasir",
      pin: REDACTED,
      passwordHash: REDACTED,
      nested: [{ token: REDACTED, newPin: REDACTED, note: "ok" }],
    });
  });

  it("keeps non-secret flags that merely mention a PIN", () => {
    expect(maskSensitive({ mustChangePin: true })).toEqual({ mustChangePin: true });
  });

  it("leaves primitives and dates untouched", () => {
    const date = new Date(0);
    expect(maskSensitive("text")).toBe("text");
    expect(maskSensitive(null)).toBeNull();
    expect(maskSensitive({ at: date })).toEqual({ at: date });
  });
});
