# ADR-0002: Serving HTTP QUERY from the proxy

- Status: Accepted (production edge verification pending, see below)
- Date: 2026-09-25
- Requirements: PRD §8.2

## Context

The API should offer the `QUERY` method (safe, idempotent, with a request
body) for complex searches. A spike on Next.js 16.3 established:

1. Node's HTTP parser accepts `QUERY`, and the request, body included,
   reaches `proxy.ts`.
2. Route handlers only export `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`,
   `DELETE` and `PATCH` (`next/dist/server/web/http.js`). A `QUERY` request
   rewritten to a route handler is rejected with `400`.
3. `proxy.ts` runs on the Node.js runtime and may return a response directly.

## Decision

- `proxy.ts` dispatches `QUERY` requests through the table in
  `src/lib/http/query-routes.ts`.
- Every `QUERY {collection}` has a `POST {collection}/search` route backed by
  the **same handler**, so behaviour cannot diverge and clients whose tooling
  lacks `QUERY` keep a standard fallback.
- Handlers are imported lazily, so the proxy bundle only loads them when a
  `QUERY` arrives.
- Collections without an entry answer `405` with an `Allow` header.
- Responses produced in the proxy bypass `next.config.ts` headers, so the
  proxy applies the security headers itself.

## Verification

- Local production build: covered by `e2e/api.spec.ts`.
- **Vercel edge: pending.** Deploy an `-rc` tag to staging with
  `ENABLE_DIAGNOSTICS=true` and run:
  `curl -X QUERY https://<staging>/api/v1/diagnostics -H 'content-type: application/json' -d '{"probe":"edge"}'`.
  If the edge rejects the method, the documented `POST …/search` routes
  become the primary contract; no other change is needed.

## Consequences

- Proxy code paths must stay small; heavy work belongs in the lazily loaded
  handlers.
