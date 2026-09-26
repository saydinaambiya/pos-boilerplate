# ADR-0015: Monthly housekeeping by export and mark

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §3.12, FR-HK-01..07, BR-18

## Context

The free database tier is small. Owners need to take old transactions out
of day-to-day views and keep a copy, without the server storing files and
without losing data that reports or open store credit still need.

## Decision

- **Unit of work**: one store month. A month is archivable once it ended
  at least `housekeepingRetentionMonths` ago (setting, minimum 3). Each
  month is exported and marked on its own, so no request has to process
  more than a month (FR-HK-07).
- **Scope per month**: sales created in the month except those whose store
  credit is not settled, with their lines, payments, credit and credit
  payments; stock movements of the month; online orders of the month in a
  final state (completed, cancelled, returned) with their lines and
  events. Export and marking use the same conditions (`archiveEntities`).
- **Export**: `GET /api/v1/housekeeping/{YYYY-MM}` streams a ZIP (fflate)
  with one CSV per entity (all columns, snake_case headers, formula
  neutralisation) and a `manifest.json`. Rows are read in id order a
  thousand at a time. SHA-256 and row counts are computed while streaming;
  when the last byte has been handed to the response, the batch
  (`archive_batches`, one row per month) records counts, checksums, actor
  and time. Nothing is written to disk.
- **Marking**: a separate confirmed step. It locks the batch, counts the
  rows again and refuses if they differ from the last export (the owner
  downloads again), then sets `archived_at` and `archive_batch_id`. Rows
  are never deleted.
- **Visibility**: reports ignore the marker. The online order board, the
  store credit list and stock movement history hide archived rows unless
  "show archived data" is ticked. Archived months keep an "Archived" tag and
  can be downloaded again.
- **Access**: everything needs `page:housekeeping`, which only the Owner
  holds by default.

## Consequences

- "Download finished" means the server finished sending; if the browser
  failed to save the file, the owner can download again before marking,
  and at any time after.
- Marking alone frees no space. A later step may delete archived rows
  (for example after a second confirmation); the batch checksums make that
  verifiable against the saved ZIP.
- Store credit settled after its month was marked stays live until that
  month is exported and marked again; the count check then catches it.
