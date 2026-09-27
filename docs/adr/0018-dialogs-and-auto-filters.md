# ADR-0018: Dialogs instead of single-form pages, and filters that apply themselves

- Status: Accepted
- Date: 2026-09-27
- Requirements: FR-UX-04, FR-UX-05, FR-UX-06, FR-UI-08, FR-POS-10

## Context

The owner's second v1.0 review found that opening a page for a single form
(a new voucher, renaming a marketplace) or for a short detail (a sale, a
shift report) costs a full navigation and loses the list the user came
from. Filters also needed an extra "Apply" click after every change.

## Decision

- **Route dialogs.** Pages whose content was one form (optionally with its
  record's status toggle) or a short read-only detail became dialogs on
  their list page, opened by a search parameter: `?new=1` to create,
  `?edit=<id>` to edit, `?view=<id>` to read, plus `/pos?close=1` and
  `/products/<id>?variant=<id>`. `RouteDialog` (`components/ui`) renders
  when the server sees the parameter, so the dialog loads its data like a
  page, can be linked to, and permission checks stay on the server.
  Closing replaces the URL with the list's own query (filters kept).
- A successful `ActionForm` inside a `RouteDialog` closes it; the result
  still opens in the shared result dialog. Actions that redirect to the
  list close it by dropping the parameter. `ConfirmAction` isolates its
  own form with `RouteDialogBoundary`, so a status change keeps the edit
  dialog open and refreshes it.
- Richer pages stay pages: product edit (with variants), employee edit
  (three forms), voucher, kasbon, online order and stock detail.
- The former URLs redirect (temporary, `next.config.ts`) to their dialog.
- **Filters.** `FilterForm` replaces the GET filter forms: a choice
  applies at once, typing applies 400 ms after the last keystroke, Enter
  applies immediately. `Select` and `DatePicker` fire a bubbling `input`
  event from their hidden input so the form sees them like native
  controls. Empty values and the page number are dropped from the URL.
  When the URL changes from elsewhere (reset link, back button) the
  fields remount with the new values. Without JavaScript a submit button
  renders inside `<noscript>`.

## Consequences

- Opening a dialog is a soft navigation that re-renders the list page on
  the server; lists stay paginated, so the cost is bounded.
- Dialog content renders only after hydration (Radix portals), so these
  flows need JavaScript. Filters still work without it.
- E2E tests scope field lookups to the dialog where the list behind it
  has a field with the same label.
