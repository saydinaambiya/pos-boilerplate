import { problemResponse, problems } from "./problem";

/**
 * HTTP QUERY support (PRD §8.2, docs/adr/0002-http-query-method.md).
 *
 * Next.js route handlers only accept GET/HEAD/OPTIONS/POST/PUT/DELETE/PATCH,
 * so QUERY is dispatched from `proxy.ts`. Each entry maps a collection path
 * to the same handler that serves its `POST {path}/search` fallback, keeping
 * one implementation for both methods. Handlers are imported lazily so the
 * proxy bundle only pulls them in when a QUERY request arrives.
 */
export type QueryRouteTable = Record<
  string,
  () => Promise<(request: Request) => Promise<Response>>
>;

export const QUERY_METHOD = "QUERY";

export async function dispatchQuery(
  request: Request,
  pathname: string,
  routes: QueryRouteTable,
): Promise<Response> {
  const load = routes[pathname];
  if (!load) {
    return problemResponse(problems.methodNotAllowed(QUERY_METHOD), {
      headers: { Allow: "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE" },
    });
  }
  const handler = await load();
  return handler(request);
}
