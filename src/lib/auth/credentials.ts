import "server-only";

import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

/**
 * Argon2id with the OWASP-recommended baseline (19 MiB, t=2, p=1)
 * (PRD FR-AUTH-03, ADR-0006). `@node-rs/argon2` defaults to Argon2id.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Owner password policy (FR-AUTH-01). */
export const passwordSchema = z.string().min(12).max(128);

/** Employee PIN policy (FR-AUTH-02). */
export const pinSchema = z.string().regex(/^\d{6}$/);

export function hashSecret(secret: string): Promise<string> {
  return hash(secret, ARGON2_OPTIONS);
}

export async function verifySecret(storedHash: string, secret: string): Promise<boolean> {
  try {
    return await verify(storedHash, secret);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same work as a real verification so unknown usernames take as
 * long as wrong secrets (username enumeration via timing, ASVS V2.2).
 */
export async function verifyAgainstDummy(secret: string): Promise<void> {
  dummyHash ??= hashSecret("dummy-secret-for-timing-equalisation");
  await verifySecret(await dummyHash, secret);
}
