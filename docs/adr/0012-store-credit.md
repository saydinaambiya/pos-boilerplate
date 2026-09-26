# ADR-0012: Store credit, installments and the cash drawer

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §3.8, §4.3, FR-PAY-05, FR-KSB-01..06, FR-SHF-03, FR-INV-04, BR-11, BR-12, BR-13

## Context

A sale's unpaid remainder can become store credit ("kas bon") that the
customer pays off in installments. Each installment reduces the balance only
once an approver agrees (BR-12). This raises questions the PRD leaves open:
how customers are identified, where installments live, and how cash taken
for an installment reaches the shift's expected cash.

## Decision

- **Customers** are keyed by their normalised Indonesian mobile number
  (`+628…`). Checkout upserts by phone, so a repeat customer keeps one row;
  the latest name and a non-empty note win. The POS suggests earlier
  customers while typing.
- **Opening credit** needs `kasbon:create`. Checkout accepts payments below
  the total only when a `kasbon` block is present; the remainder becomes a
  `kasbons` row (`total`, `paid_total`, `balance`, optional due date) in the
  same transaction and the sale is `COMPLETED_WITH_KASBON`. Opening credit
  is not itself an approval. No `KASBON` payment row is written; the credit
  row is the record.
- **Installments** are `payments` rows with `kasbon_id`, starting as
  `PENDING`, filed as `KASBON_PAYMENT` approvals targeting the payment
  (ADR-0011). Recording one needs `kasbon:pay`. The credit row is locked
  while the amount is checked against `balance − pending`, so concurrent
  requests cannot overshoot (FR-KSB-05). Approval sets the payment to
  `SETTLED`, moves `paid_total`/`balance`, and settles the credit at zero.
  Rejection or withdrawal sets the payment to `FAILED`. A check constraint
  keeps `balance = total − paid_total ≥ 0`.
- **Cash drawer**: cash for an installment is physically received when it
  is recorded, so a cash installment requires the recorder's open shift and
  counts towards that shift's expected cash while pending or settled. A
  rejected one is excluded, meaning the cash was handed back. Transfers
  attach the shift when one is open. Shift reports list credit given and
  installments received.
- **Aging** uses whole store-local days since the credit was given (0–30,
  31–60, over 60) and marks due dates as upcoming, today or overdue.
- **Voids** of sales with store credit are refused for now; unwinding
  credit with installments needs its own rules.

## Consequences

- Invoices show the credit as a payment line plus the current balance and
  customer, so a reprint reflects later installments.
- Housekeeping (FR-HK-05) can rely on `kasbons.status` to keep unsettled
  credit out of archives.
- Voiding a credit sale is a follow-up decision, not an oversight.
