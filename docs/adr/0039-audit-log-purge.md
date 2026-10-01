# ADR-0039: Audit log purge after a CSV download

- Status: Accepted
- Date: 2026-10-01
- Requirements: PRD FR-AUD-04, FR-AUD-05; BRD Q-45
- Amends: FR-AUD-04 (audit entries were never deleted)

## Context

The audit log only grows. The user wants to delete old entries by date
range, but never today's, and only after the entries were downloaded as
CSV: download first, then delete. This came up in the 1.4 round and was
set aside then; it came back after the 1.4 demo.

## Decision

- **Owner only.** Only the system Owner role can export and delete, even
  if another role holds `audit:view`. "Hapus log lama" on the audit page
  opens a dialog (`?purge=1&purgeFrom=…&purgeTo=…`, ADR-0018).
- **Whole past days.** The range is whole store-local days. The end date
  must be before today in the store's time zone, so today's entries, and
  the entries the purge itself writes, always stay. The date pickers stop
  at yesterday, and the server checks the range again.
- **Step 1, download.** `GET /api/v1/audit/export?from&to` streams a CSV
  with id, time, actor username and name, action, entity, entity id, diff
  as JSON, IP, user agent and request id. The CSV is not stored on the
  server, and its cells are guarded against spreadsheet formulas. Once the
  last row is sent, an `audit_purges` row records the range, row count,
  SHA-256 and who exported it, and `audit.exported` is audited. The
  button reads the whole response before saving it and then refreshes the
  dialog, so step 2 only unlocks after a complete download.
- **Step 2, delete.** The delete is locked until the range has an export
  whose row count matches the range now. The Owner ticks "Saya sudah
  menyimpan file CSV-nya" and deletes. In one transaction the server locks
  that export, counts the rows again, deletes them, marks the export as
  purged, and audits `audit.purged` with the range, count and checksum. If
  the count changed it refuses and asks for a new download.
- **No nested confirmation.** The tick box is the confirmation. A confirm
  dialog inside the purge dialog would unmount once the range is empty,
  before its result could show.

## Consequences

- FR-AUD-04 still forbids updating entries and any other delete path.
- Every purge leaves a trace in today's log and in `audit_purges`: who
  deleted what, and the checksum of the file they downloaded.
- A long range streams in a single request. If that ever gets close to
  the function time limit, purge month by month as housekeeping does
  (FR-HK-07).
