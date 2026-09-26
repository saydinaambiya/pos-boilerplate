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

## Getting started

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. With `ENABLE_DIAGNOSTICS=true` the component
showcase is available at `/id/ui`.

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

| Script           | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| `pnpm dev`       | Development server                                      |
| `pnpm build`     | Production build (validates `app.config.ts` and assets) |
| `pnpm lint`      | ESLint with typed rules, zero warnings allowed          |
| `pnpm typecheck` | Route type generation + `tsc`                           |
| `pnpm test`      | Unit tests (Vitest)                                     |
| `pnpm test:e2e`  | Playwright: flows, accessibility, CSP, JS budget        |
| `pnpm check`     | Lint, typecheck, format check and unit tests            |

## Environment variables

| Variable             | Required | Description                                                  |
| -------------------- | -------- | ------------------------------------------------------------ |
| `APP_URL`            | Yes      | Public origin of the deployment                              |
| `ENABLE_DIAGNOSTICS` | No       | `true` exposes `/api/v1/diagnostics` and `/ui`; staging only |

Variables are validated at startup by `src/config/env.ts`.

## Release & deployment

Deployments are tag-based ([ADR-0004](docs/adr/0004-tag-based-release.md)):
merge the release-please PR to create `vX.Y.Z` (production), or push
`vX.Y.Z-rc.N` to deploy staging. Branch pushes never deploy.
