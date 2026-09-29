# ADR-0025: QRIS payments and marketplace prices

- Status: Accepted
- Date: 2026-09-29
- Requirements: PRD FR-PAY-01/02/04/07, FR-ONL-01/08, FR-UI-12, FR-CSG-04; BRD Q-18..Q-21

## Context

Users asked for QRIS as a payment method. The money should go into a
destination account set up once, and the cashier should record which bank
or e-wallet the buyer paid from, as a required field. The transfer
reference number was never used, so it should go. Marketplace prices differ
from store prices, so an online order should pick its items from stock but
take a price typed per line. Units should be written without a space
(`12cm`, `50cm x 100cm`).

## Decision

- **QRIS is a payment provider** (FR-PAY-06). `payment_method` gains `QRIS`.
  The owner marks exactly one active bank account as the QRIS account
  (`bank_accounts.is_qris`, with a partial unique index), in the account's
  edit dialog. The provider fills that account in itself and never takes
  one from the client. Deactivating the account clears the flag, and
  without a QRIS account the option is hidden. `payments.source_bank`
  stores the buyer's bank or e-wallet. It is required for QRIS and rejected
  for other methods. The POS offers a list (`QRIS_SOURCE_BANKS`) plus
  "other", typed in.
- **Where it applies.** QRIS is offered at the POS, as the full payment or
  as the non-cash part of a split, and when a salesperson records sold
  goods. Store credit installments stay cash and transfer.
- **No transfer reference.** The field is gone from the POS, from
  settlements and from store credit installments. `payments.reference` is
  kept for older rows and still shown on them.
- **Marketplace prices.** Each online order line carries `unitPrice`, typed
  by staff and required. The server no longer prices the lines from the
  catalogue. The store price at entry is kept in
  `online_order_items.store_price` and shown beside the typed price. The
  audit entry lists each line's typed price, store price and whether it is
  below cost.
  - Risks: a mistyped or deliberately low price, and profit reports skewed
    by it.
  - Mitigations, agreed with the users: the price is required, the store
    price is shown for comparison, the form warns below cost for viewers
    who may see cost, and every order is audited. A price below cost is
    still allowed, because promotions happen.
- **Units without a space** (FR-UI-12). `formatSize` prints `93cm x 47cm`,
  `formatMeters` prints `38,5m` and `formatThickness` prints `2mm`. Messages
  follow the same rule. Snapshots already frozen on older sale lines keep
  their old text.

## Consequences

- Reports, shift figures and the sales history filter list QRIS as its own
  method. The cash drawer is unaffected.
- A marketplace order's value in reports is the typed price. Comparing it
  with `store_price` shows the marketplace discount if a report ever needs
  it.
