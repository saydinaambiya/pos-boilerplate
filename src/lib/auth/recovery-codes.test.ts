import { describe, expect, it } from "vitest";

import {
  createRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "./recovery-codes";

describe("recovery codes (ADR-0037)", () => {
  it("creates distinct grouped codes from the Crockford alphabet", () => {
    const codes = Array.from({ length: 200 }, createRecoveryCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes)
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(RECOVERY_CODE_COUNT).toBe(8);
  });

  it("reads typed codes loosely but rejects anything else", () => {
    expect(normalizeRecoveryCode(" abcd efgh-jkmn pq0o ")).toBe("ABCDEFGHJKMNPQ00");
    expect(normalizeRecoveryCode("1iL1-1111-1111-1111")).toBe("1111111111111111");
    for (const bad of ["", "ABCD-EFGH", "ABCD-EFGH-JKMN-PQRSU", "ABCD-EFGH-JKMN-PQR!"]) {
      expect(normalizeRecoveryCode(bad), bad).toBeNull();
    }
  });

  it("hashes the canonical form", () => {
    const code = createRecoveryCode();
    expect(hashRecoveryCode(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(code.toLowerCase().replace(/-/g, " "))).toBe(hashRecoveryCode(code));
  });
});
