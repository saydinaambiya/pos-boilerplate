# ADR-0005: Database access, migrations and tests

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §10.1, §11, §12.2, NFR-PERF-06, NFR-REL-01, NFR-CODE-05, NFR-SEC-03

## Context

The app runs on Vercel serverless functions against Postgres (Neon free tier
in staging/production, Docker locally). Queries must be parameterised,
multi-table writes transactional, schema changes safe to roll back, and
services testable against a real database.

## Decision

- **Drizzle ORM** with the **postgres.js** driver (`drizzle-orm/postgres-js`).
  One pooled client per server instance (`max: 5`, `prepare: false`), cached
  on `globalThis` in development. Production uses Neon's **pooled** endpoint;
  `prepare: false` keeps postgres.js compatible with PgBouncer. The same
  driver works unchanged against local Docker Postgres, so there is one code
  path. Neon's HTTP/WebSocket driver was not chosen because it needs a proxy
  for local development and would split behaviour between environments.
- Schema lives in `src/db/schema`, written in camelCase and mapped with
  `casing: "snake_case"`. Every table has a **UUIDv7** `id` generated in the
  application (time-ordered, index-friendly, independent of the Postgres
  version), plus `created_at` / `updated_at`.
- **Drizzle Kit** generates SQL migrations into `src/db/migrations`; they are
  reviewed like code. The deploy workflow runs `pnpm db:migrate` before
  `vercel build`, so migrations must be **expand–contract**: rolling back is
  redeploying the previous tag against the newer schema.
- `sql.raw` stays forbidden by lint; dynamic values go through the `sql`
  template, which binds parameters.
- Functions that may join a transaction accept an `Executor`
  (database or transaction), so an audit entry commits or rolls back with the
  change it describes.
- Tests: `pnpm test` runs pure unit tests; `pnpm test:int` starts a throwaway
  Postgres with **Testcontainers**, applies the real migrations and runs
  service tests against it. E2E uses the `pos_e2e` database from
  `docker-compose.yml` (a Postgres service in CI).
- Bootstrap: `pnpm db:seed` creates the Owner and default employee roles and
  the single owner account from `SEED_OWNER_*` variables; it is idempotent
  and never overwrites an existing owner.

## Consequences

- Integration tests and E2E need Docker locally (`pnpm db:up`).
- `next build` validates `DATABASE_URL` through `src/config/env.ts`, so the
  build environment must provide it (Vercel project env, CI job env).
- Destructive schema changes take two releases (expand, then contract).
