import { createHash, randomBytes } from "node:crypto";

/** Crockford base32: no I, L, O or U, so a code read aloud or retyped stays unambiguous. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 16;
const CANONICAL = new RegExp(`^[${ALPHABET}]{${String(LENGTH)}}$`);

/** How many codes one generation hands out (ADR-0037). */
export const RECOVERY_CODE_COUNT = 8;

/**
 * One 80-bit recovery code shown as `XXXX-XXXX-XXXX-XXXX`. With this much
 * entropy a plain SHA-256 digest is safe to store (ADR-0037).
 */
export function createRecoveryCode(): string {
  const bytes = randomBytes(LENGTH);
  const chars = Array.from(bytes, (byte) => ALPHABET[byte & 31]).join("");
  return chars.match(/.{4}/g)?.join("-") ?? chars;
}

/**
 * The typed code in canonical form, or null when it cannot be one: case,
 * spaces and dashes are ignored, and O, I and L read as 0, 1 and 1.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return CANONICAL.test(code) ? code : null;
}

/** Only this digest is stored; `code` may be typed with or without dashes. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(normalizeRecoveryCode(code) ?? code)
    .digest("hex");
}
