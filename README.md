# POS Boilerplate

Single-tenant point-of-sale foundation built with Next.js 16, designed to be
rebranded per store by editing one config file.

- Requirements: [docs/BRD.md](docs/BRD.md), [docs/PRD.md](docs/PRD.md)
- Decisions: [docs/adr](docs/adr/README.md)
- API errors: [docs/api/problems.md](docs/api/problems.md)
- Changes: [CHANGELOG.md](CHANGELOG.md)

## Requirements

- Node.js 22.12+ (`.nvmrc`)
- pnpm 12 (`corepack enable` picks the version from `package.json`)
- Docker (local Postgres, integration tests and E2E)

## Getting started

```bash
corepack enable
pnpm install
cp .env.example .env.local   # set SEED_OWNER_PASSWORD (min. 12 characters)
pnpm db:up                   # Postgres 17 in Docker (also creates pos_e2e)
pnpm db:migrate
pnpm db:seed                 # roles + first owner account
pnpm dev
```

Open http://localhost:3000 and sign in with the `SEED_OWNER_*` credentials.
With `ENABLE_DIAGNOSTICS=true` the component showcase is available at `/id/ui`.

Changing the schema: edit `src/db/schema`, run `pnpm db:generate --name <change>`,
review the SQL in `src/db/migrations`, then `pnpm db:migrate`
([ADR-0005](docs/adr/0005-database-access.md)).

## Customising a store

Edit [`src/config/app.config.ts`](src/config/app.config.ts) and put logo
files in `public/brand/`. Allowed values are listed in PRD §10.3; wrong values
fail `pnpm typecheck` and `pnpm build`.

| Key                        | Values                           |
| -------------------------- | -------------------------------- |
| `appearance.palette`       | `sage`, `sand`, `ocean`, `slate` |
| `appearance.layout`        | `sidebar`, `topbar`, `compact`   |
| `appearance.defaultLocale` | `id`, `en`                       |
| `appearance.defaultTheme`  | `light`, `dark`, `system`        |

Store profile data (address, phone, tax ID, invoice footer) is managed by the
owner in Settings, not in code.

## Scripts

| Script             | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `pnpm dev`         | Development server                                      |
| `pnpm build`       | Production build (validates `app.config.ts` and assets) |
| `pnpm lint`        | ESLint with typed rules, zero warnings allowed          |
| `pnpm typecheck`   | Route type generation + `tsc`                           |
| `pnpm test`        | Unit tests (Vitest)                                     |
| `pnpm test:int`    | Service tests against Postgres (Testcontainers, Docker) |
| `pnpm db:up`       | Start local Postgres (`docker-compose.yml`)             |
| `pnpm db:generate` | Generate a SQL migration from `src/db/schema`           |
| `pnpm db:migrate`  | Apply pending migrations                                |
| `pnpm db:seed`     | Create default roles and the first owner (idempotent)   |
| `pnpm test:e2e`    | Playwright: flows, accessibility, CSP, JS budget        |
| `pnpm check`       | Lint, typecheck, format check and unit tests            |

## Environment variables

| Variable                            | Required   | Description                                                                  |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| `APP_URL`                           | Yes        | Public origin of the deployment                                              |
| `DATABASE_URL`                      | Yes        | Postgres URL; Neon **pooled** endpoint in staging/production                 |
| `ENABLE_DIAGNOSTICS`                | No         | `true` exposes `/api/v1/diagnostics` and `/ui`; staging only                 |
| `INVOICE_LINK_SECRET`               | Yes        | Signs public invoice download links (≥ 32 chars); rotating revokes all links |
| `DB_STORAGE_LIMIT_MB`               | No         | Database storage quota in MB (default 500) for the capacity warnings         |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Production | Per-IP login limit; in-memory fallback locally                               |
| `SEED_OWNER_*`                      | Seed only  | Username, name and password for `pnpm db:seed`                               |

Variables are validated at startup by `src/config/env.ts`.

## Release & deployment

Deployments are tag-based ([ADR-0004](docs/adr/0004-tag-based-release.md)):
merge the release-please PR to create `vX.Y.Z` (production), or push
`vX.Y.Z-rc.N` to deploy staging. Branch pushes never deploy. The deploy
workflow applies migrations first, so the GitHub environment needs a
`DATABASE_URL` secret and the Vercel project needs `DATABASE_URL`,
`INVOICE_LINK_SECRET` and the Upstash variables.
