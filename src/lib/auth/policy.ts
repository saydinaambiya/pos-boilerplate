/**
 * Authentication limits (PRD FR-AUTH-04/05). The idle timeout itself is an
 * owner setting (`operations.sessionIdleMinutes`, FR-SET-07).
 */
export const authPolicy = {
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  ipMaxFailures: 20,
  ipWindowSeconds: 15 * 60,
  /** Sliding expiry is only written when this much of the idle window has elapsed. */
  sessionRefreshMinutes: 5,
  /** Upper bound for the cookie itself; the database expiry is authoritative. */
  cookieMaxAgeDays: 30,
} as const;

export const SESSION_COOKIE = "session";
