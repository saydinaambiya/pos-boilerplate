# ADR-0001: Stack and monolith architecture

- Status: Accepted
- Date: 2026-09-25
- Requirements: PRD §10, NFR-CODE-01..07

## Context

The product is a single-tenant POS boilerplate that must deploy in one step
to Vercel, ship little client JavaScript and stay easy to customise per store.

## Decision

- **Next.js 16 App Router** monolith with React Server Components by default.
  Client components are limited to interactive leaves (navigation state,
  dialogs, switches).
- **TypeScript strict** plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`; **typescript-eslint `strictTypeChecked`**.
- **Zod** is the single source of runtime validation and inferred types.
- **next-intl** for `id`/`en`, with the locale as the first path segment and
  read through `next/root-params`.
- **Tailwind CSS 4** utilities mapped to semantic CSS variables; **Radix**
  primitives for accessible overlays.
- Layering: `app → features → lib → db`. Features expose `service.ts`
  (business rules + authorization) consumed by both Server Actions and
  `/api/v1` route handlers, so logic is written once.
- **pnpm** with an explicit `allowBuilds` list: only dependencies that need
  install scripts may run them.

## Consequences

- Nonce-based CSP forces dynamic rendering of pages. This is acceptable
  because every operational page is per-user anyway.
- The framework baseline is ~179 KB gzip of first-load JS, which sets the
  floor for the performance budget (NFR-PERF-02).
