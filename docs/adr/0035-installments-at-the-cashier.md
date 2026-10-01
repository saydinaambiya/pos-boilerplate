# ADR-0035: Store credit payments settle at the cashier

- Status: Accepted; employees refused after hours by [ADR-0036](./0036-no-transactions-after-hours.md)
- Date: 2026-09-30
- Requirements: PRD FR-KSB-03/04, FR-APR-03, FR-SET-09; BRD BR-12, Q-41
- Amends: [ADR-0012](./0012-store-credit.md) (every installment waits for approval)

## Context

Every store credit payment by an employee waited for an approver before
the balance dropped. Customers pay at the counter, where the cashier
already takes cash into a drawer the shift close accounts for, so the wait
added nothing but delay. Users asked for the cashier to settle payments
directly during working hours.

## Decision

- **Direct when at the cashier in store hours.** A payment settles at once
  when the recorder has an open cashier shift (`DRAWER`, or one from before
  shift kinds) and the store is within its hours (FR-SET-09). The approval
  row is still written, as `APPROVED` with the recorder as decider and an
  `approval.auto-approved` audit entry, the way Owner requests work
  (FR-APR-03). History, reports and the shift's expected cash stay as they
  were.
- **Approval otherwise.** Without an open cashier shift (a transfer taken
  away from the counter), on a Sales shift, or outside store hours, the
  payment waits for `approval.kasbon:decide` as before. `pos:after-hours`
  does not count as store hours here. The Owner still settles directly at
  any time (BR-13).
- **Mechanics.** `submitApproval` takes `autoApprove`; the store credit
  service decides it inside the payment transaction, next to the
  share-locked shift. The payment form says which of the two will happen.

## Consequences

- Wrong payments at the cashier are no longer caught before the balance
  drops. The shift close still counts the cash, and the audit log records
  who took each payment.
- Approvers see fewer store credit requests; those left are the exceptions.
