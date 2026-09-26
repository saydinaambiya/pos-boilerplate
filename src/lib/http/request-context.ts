import { REQUEST_ID_HEADER } from "./request-id";

/** Request metadata recorded with sessions and audit entries (PRD FR-AUD-01). */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

const MAX_USER_AGENT_LENGTH = 512;

/**
 * Reads client metadata from request headers. On Vercel the platform
 * overwrites `x-forwarded-for`, so its first entry is the client address.
 */
export function requestContextFrom(headers: Headers): RequestContext {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded === "" ? null : (forwarded ?? headers.get("x-real-ip"));
  return {
    ip,
    userAgent: headers.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
    requestId: headers.get(REQUEST_ID_HEADER),
  };
}
