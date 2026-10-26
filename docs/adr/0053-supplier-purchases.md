# ADR-0053: Supplier purchases recorded by the owner

- Status: Accepted
- Date: 2026-10-21
- Requirements: PRD FR-PRB-01..07; BRD BR-31, Q-60
- Relates to: [ADR-0012](./0012-store-credit.md) (the receivable side),
  [ADR-0027](./0027-sales-only-and-staff-expenses.md) (staff expenses from the
  drawer), [ADR-0018](./0018-dialogs-and-auto-filters.md) (dialogs),
  [ADR-0005](./0005-database-access.md) (migrations and transactions)

## Context

The app recorded money the store is **owed** (store credit, ADR-0012) and
money leaving the drawer (staff expenses, ADR-0027), but there was nowhere to
record money the store **owes** a supplier for the goods it buys. The owner
kept those bills elsewhere and wanted to see what is still due and when.

The request was narrowed with the owner: a bill keeps the company, the nota
number, the total, the PO date and the due date, and whether it is paid or on
credit; installments are recorded and reduce what is left. It carries **no
goods lines and never moves stock**, its installments **do not touch the cash
drawer**, only the Owner sees it, the supplier is typed free, and any date is
allowed so an older bill can be entered by hand.

## Decision

- **A ledger of its own.** Two tables: `purchases` (header, `total`,
  `paid_total`, `balance`, `status`, `order_date`, `due_date`, `note`,
  `created_by`) and `purchase_payments` (installments). They are separate from
  `payments`, which feeds shifts and reports, so a purchase can never leak into
  the cashier's figures.
- **Status from the amounts.** `OPEN` → `PARTIALLY_PAID` → `SETTLED`; the list
  shows it as Paid/Credit. `balance = total − paid_total`, guarded by a check
  constraint.
- **Cash or credit at recording.** A cash bill is settled for its full total; a
  credit bill stores an optional down payment and a due date. Whatever was paid
  at recording is stored as the first installment, so the history and the
  balance always agree.
- **Off the drawer, off the clock.** Recording a bill or an installment needs
  no shift and is not limited by store hours; nothing is written to `payments`,
  shifts or reports (FR-PRB-06).
- **Owner only, no approval.** `page:purchases` shows the menu and guards the
  route; `purchase:manage` guards every write. Only the Owner holds them by
  default, and the Owner self-approves, so the generic approval engine is not
  involved (FR-APR-03).
- **One nota per supplier.** A case-insensitive unique index on
  (company, invoice number) catches double entry; the error is shown on the
  field.
- **Free dates.** `order_date` and `due_date` are unrestricted so an older bill
  can be backdated; a due date cannot be before the PO date. An installment may
  be backdated too, but not into the future or before the bill's own date.
- **One page, dialogs only.** Recording, editing, deleting a bill and
  recording or removing its installments all happen on the list through
  dialogs (`?new=1`, `?bill=<id>`, `?edit=<id>`, `?delete=<id>`,
  `?deletePayment=<id>`, ADR-0018). There is no detail page, so every action
  stays on the list and the page count stays at one.
- **Housekeeping and audit.** The `purchases` table carries the archival
  columns and joins the monthly archive, but only **settled** bills are marked
  (an unpaid bill stays live, as FR-HK-05 does for store credit). Recording,
  editing, deleting and each installment are written to the audit log.
- **Shared due helper.** `daysBetween` and `dueState` move to
  `src/lib/format/due.ts` so both store credit and purchases use one
  implementation.

## Consequences

- Migration `0041` adds the `purchase_status` and `purchase_pay_method` enums,
  the two tables and their indexes and checks.
- Purchases never appear in sales, the shift report or the money recap; the
  owner reads them on their own page.
- The module follows store credit closely (schema shape, repository/service
  split, dialogs over the list), so the two ledgers stay easy to compare.
- If supplier goods should ever move stock, that is a different change — a
  purchase order with lines feeding `stock_movements` — not this ledger.
