import { describe, expect, it } from "vitest";

import { signToken, verifyToken } from "./signed-token";

const secret = "test-secret-0123456789-0123456789";
const now = new Date("2026-09-26T00:00:00Z");
const inAWeek = new Date("2026-10-03T00:00:00Z");

describe("signed tokens (FR-PDF-04/06)", () => {
  it("round-trips the subject until expiry", () => {
    const token = signToken(secret, "invoice", "sale-1", inAWeek);
    expect(verifyToken(secret, "invoice", token, now)).toBe("sale-1");
    expect(verifyToken(secret, "invoice", token, new Date("2026-10-03T00:00:01Z"))).toBeNull();
  });

  it("rejects tampering, other purposes and rotated secrets", () => {
    const token = signToken(secret, "invoice", "sale-1", inAWeek);
    const [, expires, signature] = token.split(".");
    expect(
      verifyToken(secret, "invoice", `sale-2.${expires ?? ""}.${signature ?? ""}`, now),
    ).toBeNull();
    expect(verifyToken(secret, "invoice", `sale-1.9999999999.${signature ?? ""}`, now)).toBeNull();
    expect(verifyToken(secret, "export", token, now)).toBeNull();
    expect(verifyToken(`${secret}-rotated`, "invoice", token, now)).toBeNull();
    expect(verifyToken(secret, "invoice", "garbage", now)).toBeNull();
  });
});
