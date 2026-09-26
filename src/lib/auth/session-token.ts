import { createHash, randomBytes } from "node:crypto";

/** 256-bit random session token, sent only in the cookie (ADR-0006). */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this digest is persisted, so a database leak does not expose live sessions. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedSessionToken(value: string | undefined): value is string {
  return value !== undefined && TOKEN_PATTERN.test(value);
}
