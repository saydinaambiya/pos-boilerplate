# ADR-0033: Split payments and store credit for salespeople

- Status: Accepted
- Date: 2026-09-30
- Requirements: PRD FR-CSG-04, FR-KSB-01; BRD Q-39
- Amends: [ADR-0029](./0029-sales-without-the-cashier.md) (Sales role grants)

## Context

A salesperson recording sold goods could take one payment in full: cash,
transfer, QRIS or store credit. Store credit only showed for roles with
`kasbon:create`, which the seeded Sales role lacked, so salespeople never
saw it. Buyers also pay part in cash and the rest by QRIS or transfer,
which the cashier already supports and the Sales form did not.

## Decision

- **Split payment.** The settlement payment gains a `SPLIT` method: a cash
  amount, plus a transfer (bank account) or QRIS (source bank) for the
  rest. The server prices the sale and builds two payments, cash and the
  remainder. The cash part must be above 0 and below the total; otherwise
  the settlement is refused with `split-invalid`. The form shows the
  remainder as the cash amount is typed.
- **Store credit for Sales.** The seeded Sales role gets `kasbon:create`.
  Migration 0029 grants it to an existing role named Sales that sells
  consignments. Other roles are left as the owner set them.
- **Customer suggestions** for store credit accept `consignment:sell` as
  well as `page:pos`. Before, the lookup needed the cashier, so it was
  refused in the Sales menu.

## Consequences

- A split settlement puts its cash in the salesperson's shift and its
  transfer or QRIS on the bank account, as at the cashier. The money recap
  lists it under salespeople's cash and bank accounts (ADR-0032).
- Store credit is still a full-amount method in the Sales form. A down
  payment with the rest on credit remains a cashier feature.
