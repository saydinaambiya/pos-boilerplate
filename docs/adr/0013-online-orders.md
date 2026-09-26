# ADR-0013: Manual marketplace orders and their stock

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §3.7, §4.2, FR-ONL-01..07, FR-STK-01, BR-05, BR-19

## Context

v1 records marketplace orders by hand. Stock must leave when an order is
entered, come back on cancellation, and returns must separate goods that go
back on the shelf from damaged ones. The PRD leaves pricing, the ledger
entries for returns, and concurrency open.

## Decision

- **Pricing**: lines are priced from the catalogue (variant override or
  product price) and snapshotted with the product and colour names, like POS
  sales. The order keeps an items total and an optional shipping fee; no
  `payments` row is written, the order itself is the record of marketplace
  revenue.
- **Uniqueness**: the order code is stored upper-case and unique per
  marketplace, case-insensitively (index on `upper(order_code)`), which also
  prepares for API sync (PRD §13).
- **Stock**: entry writes `ONLINE_SALE` movements through the single stock
  write path, locked in variant id order and honouring the negative stock
  setting. Cancelling (only from `PROCESSING`) writes `RETURN` movements.
  Receiving a return records each line's condition: `GOOD` writes `RETURN`;
  `DAMAGED` writes `RETURN` followed by `WRITE_OFF`, so the ledger shows the
  goods came back and were written off rather than silently netting to zero.
- **Status changes** follow a transition table (`transitions.ts`). The form
  posts the status the user saw; the order row is locked and a mismatch is
  refused as stale, so two people cannot apply conflicting changes. Every
  change appends an `online_order_events` row with actor, time and note.
  A complaint needs its note; closing a complaint needs a resolution
  (refund, resend, rejected); receiving a return needs every line's
  condition.
- **Permissions**: entering orders and viewing the board need
  `page:online-orders`; changing status needs `order.online:update-status`.
- **Held orders** use the existing operations setting `heldOrderHours`
  (default 48 hours) instead of a new setting.

## Consequences

- Reports can read marketplace revenue from `online_orders` without
  joining payments.
- Partial returns (some units of a line) are out of scope for v1; a line
  is returned as a whole.
