# ADR-0031: Run functions in the database's region

- Status: Accepted
- Date: 2026-09-29
- Requirements: PRD NFR-PERF; complements [ADR-0005](./0005-database-access.md)

## Context

Production pages took around 4 s, for example the online orders board:
about 0.9 s to the first byte and about 3.2 s more while the page
streamed. The database is Neon in Singapore. `vercel.json` set no region,
so Vercel ran the functions in its default region (Washington, `iad1`).
A request makes 10–15 sequential database round trips: the session
lookup, its permissions, the idle-timeout setting, the last-seen update,
the layout badges and then the page queries. A cold instance also opens a
TLS connection. At roughly 230 ms per US–Singapore round trip, that adds
up to several seconds.

## Decision

Pin the functions to Singapore, next to the database:
`"regions": ["sin1"]` in `vercel.json`. The setting is checked in, so every
tag deploy uses it, whatever the project settings say.

## Consequences

- A database round trip drops from about 230 ms to a few ms, and most
  pages should render in well under a second. Neon's cold start after
  5 idle minutes can still slow the first request.
- The region must move with the database. If the database moves, change
  this setting in the same release.
- Fewer sequential queries per request, such as reading the session and
  its permissions in one go, would help further. That can be done
  separately if needed.
