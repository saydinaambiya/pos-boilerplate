# ADR-0017: Custom form controls after the v1.0 review

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §7.1, FR-UI-01, FR-UX-05, NFR-SEC (CSP, ADR-0003)

## Context

The owner's review asked for dropdowns and date fields that match the
design system, money inputs grouped by thousands, a show/hide toggle for
secrets, and action results in a dialog. Native controls were chosen
earlier because they work before hydration and need no inline styles.

## Decision

- **Select** (`components/ui/select.tsx`) wraps Radix Select: labelled
  combobox, listbox with keyboard support, value posted through our own
  hidden input. Radix renders inline `style` attributes during server
  rendering, which the nonce CSP blocks, so a static button with the same
  look renders until hydration. The viewport's injected `<style>` receives
  the document nonce via `get-nonce` (see `StyleNonce`).
- **DatePicker** (`components/ui/date-picker.tsx`) is a Radix Popover with a
  `react-day-picker` grid, localised, with min/max and an optional clear
  button; it posts `YYYY-MM-DD`, so server parsing is unchanged.
- **MoneyInput** groups thousands per locale while typing and keeps the
  caret by digit position; `parseRupiah` already accepts both separators.
- **ResultDialog** shows action outcomes with an OK button. `ActionForm`
  uses it for every server action; field errors also stay inline and
  closing the dialog focuses the first invalid field. The root client
  provider ships only the `Feedback` and `Picker` catalogs.
- E2E tests use `choose()` and `expectResult()` helpers for these controls.

## Consequences

- Filter dropdowns cannot be opened before hydration; their default value
  still submits.
- One new dependency (`react-day-picker`); the POS stays within its JS
  budget.
