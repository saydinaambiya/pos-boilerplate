# ADR-0044: One shared store shift, sales shifts apart and without a float

- Status: Accepted
- Date: 2026-10-12
- Requirements: PRD FR-SHF-01..05; BRD Q-50
- Amends: [ADR-0029](./0029-sales-without-the-cashier.md) (sales shift float), [ADR-0032](./0032-money-recap-and-atm-deposits.md) (one drawer shift at a time)

## Context

Every cashier opened a shift of their own, so a second account on the
cashier had to open another shift on the same drawer, with its own float.
The store asked to use one shift: another account should carry on in it.
They also asked for a note on the opening cash, for salespeople to see
only their own shift, apart from the store's, and for no opening cash on
a sales shift, because salespeople never take money out.

## Decision

- **One store shift, shared.** At most one drawer shift is open. Every
  holder of `page:pos` sells, records expenses and takes store credit
  payments in it, without opening their own. Each sale still names the
  cashier who made it. Opening is refused while a drawer shift is open,
  under the drawer lock, so two cashiers cannot open one each.
- **Anyone at the cashier may close it.** `closed_by` keeps who did, and
  the report shows who opened and who closed the shift.
- **One lookup.** `openShiftScope` decides which shift is "the caller's
  open shift": for a cashier the open drawer shift, their own first if
  several are still open from before this change; for a salesperson their
  own. Checkout, expenses, store credit payments, the store-hours prompt
  and the shift pages all use it.
- **A note on the opening cash.** `opening_note` is optional and shows in
  the close dialog and the report.
- **Sales shifts apart.** A salesperson's shift is opened with no cash
  and no note; the open form shows no amount. The shift history has a
  "Shift toko" and a "Shift sales" tab. Every cashier sees the store
  shifts, which they share. Sales shifts are visible only to their
  salesperson and to `report:view` holders.

## Consequences

- Migration 0035 adds `shifts.opening_note` and `shifts.closed_by`.
- The warning about other open shifts at the cashier is gone; it cannot
  happen with one shared shift.
- Store shifts left open by several cashiers before this change keep
  working: each cashier carries on in their own until it is closed.
- The E2E spec that closes the store shift runs last in its own project,
  so it does not close the shift under specs that are selling.
