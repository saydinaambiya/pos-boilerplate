# ADR-0020: Field sales consignments

- Status: Accepted; "Who" amended by [ADR-0024](./0024-consignment-roles.md)
- Date: 2026-09-28
- Requirements: PRD §3.16 FR-CSG-01..06, FR-STK-01, FR-POS-11, FR-SET-09; BRD BR-27, Q-07, Q-08

## Context

Salespeople take goods out of the store, sell some on the road and bring the
rest back. Users asked for a Sales menu where goods can be taken first (stock
goes down), more can be added on later days while earlier pickups stay on
record, unsold goods can be returned, and whatever sold becomes a sale paid by
cash, transfer or store credit.

## Decision

- **Model.** `consignments` is one running record per salesperson while
  anything is out (partial unique index on `OPEN`). Every visit is an
  immutable `consignment_batches` row, `TAKE` or `SETTLE`, with its own
  idempotency key; `consignment_items` holds per-variant quantities with
  kind `TAKE`, `SOLD` or `RETURN` and frozen names and prices. What is still
  out is derived (Σ TAKE − Σ SOLD − Σ RETURN per variant), never stored, so
  there is nothing to drift. A consignment closes when that reaches zero;
  the next pickup opens a new one.
- **Stock.** Goods leave the shelf at pickup through `CONSIGNMENT_OUT`, via
  `recordStockMovement` with the usual negative-stock rule, and come back
  through `CONSIGNMENT_RETURN`. The salesperson physically has them, so
  counting them as sold only later would let the shelf oversell.
- **Selling.** A settlement's sold part goes through the normal `checkout`
  service, extended with an optional `ConsignmentSale`: the sale gets
  `sales.consignment_id`, writes no `SALE` movements, and an `onSale` hook
  writes the settlement batch, returns and closing inside the same
  transaction. Pricing, tax, invoice numbering, the open-shift rule,
  idempotency, store credit and the buyer name all stay in one place. The
  quantities are checked against what is outstanding under a row lock on the
  consignment inside that transaction, so an over-settlement rolls the sale
  and its invoice number back. Payment is in full by cash or transfer, or
  on store credit; split payments were not asked for.
- **Who.** `page:consignments` shows the menu, `consignment:take` lets a
  salesperson record their own goods, `consignment:manage` covers everyone.
  Taking money needs POS access and an open shift, so a salesperson without
  POS rights settles through a cashier. Store hours (ADR-0019) apply to
  pickups and settlements.
- **No voids.** A settlement sale cannot be voided: a `VOID` movement would
  put back stock that already left at pickup. Mistakes are corrected with a
  stock adjustment.

## Consequences

- Reports and shift totals include settlement sales like any POS sale; the
  sale's `consignment_id` tells them apart if a report ever needs to.
- Goods out with salespeople are not on the shelf, so the stock page shows
  them as moved out; the Sales page is where to see them.
- Housekeeping does not archive consignment tables yet; they are small and
  can join the monthly export when needed.
