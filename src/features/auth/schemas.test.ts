import { describe, expect, it } from "vitest";

import { requestContextFrom } from "@/lib/http/request-context";

import { changePinInput, loginInput } from "./schemas";

describe("loginInput (NFR-SEC-02)", () => {
  it("normalises usernames to lowercase", () => {
    expect(loginInput.parse({ username: "  Kasir.01 ", secret: "x" }).username).toBe("kasir.01");
  });

  it("rejects unknown fields and malformed usernames", () => {
    expect(loginInput.safeParse({ username: "kasir", secret: "x", role: "Owner" }).success).toBe(
      false,
    );
    expect(loginInput.safeParse({ username: "a b", secret: "x" }).success).toBe(false);
  });
});

describe("changePinInput (FR-AUTH-06)", () => {
  it("requires six digits and a matching confirmation", () => {
    expect(changePinInput.safeParse({ pin: "123456", confirmPin: "123456" }).success).toBe(true);
    const result = changePinInput.safeParse({ pin: "12345a", confirmPin: "123456" });
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain("pin");
    const mismatch = changePinInput.safeParse({ pin: "123456", confirmPin: "654321" });
    expect(mismatch.error?.issues.map((issue) => issue.path[0])).toEqual(["confirmPin"]);
  });
});

describe("requestContextFrom", () => {
  it("takes the first forwarded address and truncates the user agent", () => {
    const context = requestContextFrom(
      new Headers({
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "user-agent": "x".repeat(600),
        "x-request-id": "req-12345678",
      }),
    );
    expect(context).toEqual({
      ip: "203.0.113.7",
      userAgent: "x".repeat(512),
      requestId: "req-12345678",
    });
  });

  it("falls back to x-real-ip or null", () => {
    expect(requestContextFrom(new Headers({ "x-real-ip": "198.51.100.2" })).ip).toBe(
      "198.51.100.2",
    );
    expect(requestContextFrom(new Headers()).ip).toBeNull();
  });
});
