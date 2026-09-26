import { describe, expect, it } from "vitest";

import { createNonce, pageContentSecurityPolicy } from "./headers";

describe("pageContentSecurityPolicy", () => {
  it("binds scripts and style elements to the nonce", () => {
    const csp = pageContentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("style-src-elem 'self' 'nonce-abc123'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("never allows eval outside development", () => {
    expect(pageContentSecurityPolicy("n", false)).not.toContain("unsafe-eval");
    expect(pageContentSecurityPolicy("n", true)).toContain("unsafe-eval");
  });
});

describe("createNonce", () => {
  it("returns a fresh base64 value of 128 bits", () => {
    const first = createNonce();
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(first);
  });
});
