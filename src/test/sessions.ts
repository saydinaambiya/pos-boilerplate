import { login } from "@/features/auth/service";
import { type Session, validateSessionToken } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

let counter = 0;

/** Unique request context per call, so the in-memory IP limiter never interferes. */
export function testContext(): RequestContext {
  counter += 1;
  return { ip: `10.1.0.${counter % 250}`, userAgent: "vitest", requestId: `req-${counter}` };
}

/**
 * Session tokens per username. Reusing one device per account keeps tests
 * under the device limit (FR-AUTH-09); cleared by `resetDatabase`.
 */
const tokens = new Map<string, string>();

export function forgetSignIns(): void {
  tokens.clear();
}

/**
 * Signs in through the real login flow once per account and returns the
 * session, resolved again on every call so permission changes apply
 * (FR-RBAC-03).
 */
export async function signIn(username: string, secret: string): Promise<Session> {
  const cached = tokens.get(username);
  const reused = cached ? await validateSessionToken(cached) : null;
  if (reused) return reused;
  const result = await login({ username, secret }, testContext());
  if (!result.ok) throw new Error(`sign-in failed for ${username}: ${result.reason}`);
  tokens.set(username, result.token);
  const session = await validateSessionToken(result.token);
  if (!session) throw new Error("session expected");
  return session;
}

/** Signs in on an additional device, bypassing the reuse of `signIn`. */
export async function signInNewDevice(username: string, secret: string): Promise<Session> {
  const result = await login({ username, secret }, testContext());
  if (!result.ok) throw new Error(`sign-in failed for ${username}: ${result.reason}`);
  const session = await validateSessionToken(result.token);
  if (!session) throw new Error("session expected");
  return session;
}
