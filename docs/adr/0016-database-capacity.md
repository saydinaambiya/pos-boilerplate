# ADR-0016: Database capacity monitoring

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §3.13, FR-CAP-01..05, FR-DSH-01

## Context

Free database tiers have small, changing storage quotas. The owner should
notice early and know where to act, without every page load querying the
catalogue.

## Decision

- The quota comes from `DB_STORAGE_LIMIT_MB` (default 500), not code.
- Usage is `pg_database_size(current_database())`; the eight largest public
  tables come from `pg_total_relation_size`. Both are read at most once an
  hour per server instance (in-memory cache), so serverless instances may
  briefly disagree; that is acceptable for an hourly indicator.
- Levels: 70 % info, 85 % warning, 95 % critical. From 70 % a banner
  appears on every page, `role="alert"` when critical, linking to
  housekeeping.
- The banner, the dashboard widget and the housekeeping widget are shown to
  holders of `page:housekeeping` (the Owner by default), the people who can
  act on it. The bar is an SVG so it needs no inline style under the CSP.

## Consequences

- Archiving (ADR-0015) marks rows but frees no space; if the database keeps
  growing, deleting archived rows is the follow-up.

## Amendment (2026-10-01): manual refresh

- The capacity card has a "Perbarui" button (FR-CAP-05). It measures again
  right away and restarts the one-hour cache, so the hourly refresh keeps
  running. A click within 10 seconds of the last reading reuses that
  reading. The result shows as a new "Diperiksa pukul" time, with no
  pop-up.
