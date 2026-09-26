export const REQUEST_ID_HEADER = "x-request-id";

const ACCEPTED = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Reuses a caller-supplied request id when it is well-formed so traces can be
 * correlated across systems; otherwise mints a new one (PRD §8.2 Tracing).
 */
export function resolveRequestId(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER);
  return incoming && ACCEPTED.test(incoming) ? incoming : crypto.randomUUID();
}

export function requestIdOf(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? "unknown";
}
