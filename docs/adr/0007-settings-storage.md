# ADR-0007: Owner settings storage and caching

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD FR-SET-01..08, FR-AUTH-05, FR-UI-11, BR-18

## Context

Owner-managed settings (store profile, tax, operational rules) change
rarely but are read on hot paths: every session check needs the idle
timeout and every request's i18n config needs the store time zone. The
three configuration sources must not overlap (FR-SET-08): brand and
appearance in `app.config.ts`, secrets in env, everything the owner edits in
the database.

## Decision

- One `settings` row per section key with a `jsonb` value. Each key has a
  strict Zod schema and defaults in `src/lib/settings/schemas.ts`; values are
  validated on write and parsed on read. Stored values are merged over the
  defaults, so adding a field needs no data migration; if a stored value no
  longer validates, defaults are used and an error is logged.
- Percentages are stored as integer basis points (11 % = 1100).
- Reads go through a per-instance cache with a 30-second TTL. A write clears
  the local entry; other serverless instances see the change within 30 s.
- Bank accounts and marketplaces are ordinary tables (they are referenced by
  payments and orders), deactivated rather than deleted.
- Every save is audited with only the changed fields.

## Consequences

- A new idle timeout or time zone can take up to 30 s to apply everywhere;
  acceptable for settings changed a few times a year.
- Integration tests clear the cache between tests (`clearSettingsCache`).
