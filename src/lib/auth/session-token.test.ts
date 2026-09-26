import { describe, expect, it } from "vitest";

import { createSessionToken, hashSessionToken, isWellFormedSessionToken } from "./session-token";

describe("session tokens (ADR-0006)", () => {
  it("are 256-bit, unique and well-formed", () => {
    const tokens = new Set(Array.from({ length: 50 }, createSessionToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(isWellFormedSessionToken(token)).toBe(true);
  });

  it("are stored as a stable SHA-256 digest", () => {
    const token = createSessionToken();
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("rejects malformed cookie values before touching the database", () => {
    expect(isWellFormedSessionToken(undefined)).toBe(false);
    expect(isWellFormedSessionToken("short")).toBe(false);
    expect(isWellFormedSessionToken(`${"a".repeat(42)}!`)).toBe(false);
  });
});
