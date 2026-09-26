import { login } from "@/features/auth/service";
import { type Session, validateSessionToken } from "@/lib/auth/session";
import type { RequestContext } from "@/lib/http/request-context";

let counter = 0;

/** Unique request context per call, so the in-memory IP limiter never interferes. */
export function testContext(): RequestContext {
  counter += 1;
  return { ip: `10.1.0.${counter % 250}`, userAgent: "vitest", requestId: `req-${counter}` };
}

/** Signs in through the real login flow and returns the resolved session. */
export async function signIn(username: string, secret: string): Promise<Session> {
  const result = await login({ username, secret }, testContext());
  if (!result.ok) throw new Error(`sign-in failed for ${username}: ${result.reason}`);
  const session = await validateSessionToken(result.token);
  if (!session) throw new Error("session expected");
  return session;
}
