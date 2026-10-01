# ADR-0036: No transactions after hours, with a way to close the shift

- Status: Accepted
- Date: 2026-09-30
- Requirements: PRD FR-SET-09, FR-KSB-03, FR-EXP-01; BRD BR-24, Q-42
- Amends: [ADR-0019](./0019-devices-hours-and-loading.md) (what store hours block), [ADR-0035](./0035-installments-at-the-cashier.md) (installments after hours)

## Context

Store hours stopped checkout, opening a shift and consignment writes, but
a shift left open past closing could still take store credit payments
(filed for approval) and record expenses. Users asked for every
transaction outside store hours to be refused, with a prompt to close the
cashier right away.

## Decision

- **Refused after hours.** Store credit payments and staff expenses check
  `storeClosedFor` like checkout does, so employees are refused outside
  store hours. The Owner and `pos:after-hours` holders are still exempt;
  their store credit payments then wait for approval (ADR-0035). ATM
  deposits stay allowed after closing, since they happen once the drawer
  is counted (ADR-0032).
- **Close-shift prompt.** `storeClosedRejection` builds the message. When
  the caller still has a shift open, it adds a "Tutup shift sekarang" link
  that opens the close-shift dialog: `/pos?close=1` for a cashier shift,
  `/consignments?closeShift=1` for a Sales shift. `ActionResult` and
  `FormState` carry the link as `action`, and `ResultDialog` shows it
  before "Oke". The POS payment dialog shows it under its error.
- **Unchanged.** Closing a shift stays possible after hours, and the POS
  page keeps its closed card with the same close-shift button.

## Consequences

- An employee who forgets to close the shift sees the prompt on the next
  transaction they try instead of recording it.
- Consignment writes keep their own store-closed message without the link;
  Sales holds `pos:after-hours` by default, so it rarely applies.
