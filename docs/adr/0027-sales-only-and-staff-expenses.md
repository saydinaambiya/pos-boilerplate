# ADR-0027: Sales results only, and daily staff expenses

- Status: Accepted; recap balance amended by [ADR-0032](./0032-money-recap-and-atm-deposits.md)
- Date: 2026-09-29
- Requirements: PRD FR-PRD-01/02, FR-RPT-02, FR-SHF-03, §3.17 FR-EXP-01..03; BRD Q-25..Q-28
- Supersedes: cost visibility in FR-PRD-02 and profit in FR-RPT-02 ([ADR-0014](./0014-sales-reports.md))

## Context

The owner does not track cost or profit. They want the sales results only.
They also want a daily record of money paid to staff, such as meal and
fuel allowances or a donation, and they want it in the daily recap. They
also reported two dropdown faults: a new product had no colour to choose,
and a long list could not be scrolled inside a dialog.

## Decision

- **No cost or profit.** The cost fields, the cost overrides on colours,
  the cost and margin columns, gross profit in the recap and the CSV cost
  columns are gone. So are the permissions `product:view-cost` and
  `report:view-profit` (migration 0024 deletes their grants). The columns
  and the sale-time `unit_cost` snapshots stay in the database: new rows
  get 0, and nothing reads them.
- **Staff expenses are cash leaving the drawer.** `cash_expenses` rows
  hold the shift, the recorder, the recipient, the kind, the amount and a
  note.
  - The kinds are fixed in code: `MEAL`, `FUEL`, `DONATION` and `OTHER`.
  - Every kind except `DONATION` and `OTHER` needs a recipient, and
    `OTHER` needs a note.
  - Recording needs `expense:record` and the recorder's open shift, which
    is share-locked while the row is written. `page:expenses` shows the
    day's list. Rows are never edited, like payments.
  - A shift's expected cash is the float plus cash sales plus cash store
    credit payments, minus its expenses (FR-SHF-03).
  - The recap has an expenses card per kind. Its daily rows and summary
    show expenses and a balance, which is total sales minus expenses. The
    CSV has an expenses section.
- **A new product names its first colour.** The create form asks for a
  listed colour, and the default roll carries it from the start
  (`has_variants`). "Enable variants" remains only for older colourless
  products.
- **Dropdowns scroll in dialogs.** `Combobox` uses a modal popover, so its
  list scrolls while a dialog locks scrolling elsewhere. Lists hide their
  scrollbar through a `scrollbar-none` utility.

## Consequences

- The Owner decides which roles may record expenses, since none get
  `expense:record` by default.
- A mistaken expense is corrected with an opposite entry of type "other"
  or noted at shift close, as rows cannot be edited.
