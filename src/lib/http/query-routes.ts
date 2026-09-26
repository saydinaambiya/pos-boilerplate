import type { QueryRouteTable } from "./query-method";

/**
 * Collections that accept `QUERY`. Register a collection here together with
 * its `POST {collection}/search` route so both share one handler.
 */
export const queryRoutes: QueryRouteTable = {
  "/api/v1/diagnostics": async () => (await import("@/features/diagnostics/api")).queryDiagnostics,
};
