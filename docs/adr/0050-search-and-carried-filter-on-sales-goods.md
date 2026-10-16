# ADR-0050: Search and a carried-only filter on a salesperson's goods

- Status: Accepted
- Date: 2026-10-16
- Requirements: PRD FR-CSG-11, FR-CSG-05; BRD Q-56
- Builds on: [ADR-0018](./0018-dialogs-and-auto-filters.md)
  (dialogs and auto-applied filters)

## Context

A salesperson's page (`/consignments/[id]`) lists every item ever carried
in one consignment, with taken, sold, returned and still-carried amounts,
beside a dated history of every pickup and settlement. A consignment stays
open for weeks, so both grow long, and most summary rows end at 0 carried
once goods are sold or brought back.

## Decision

- **One search for both panels.** `?q=` narrows the summary to items whose
  brand, name, motif, colour or variant hold every typed word, in any order
  and case. The history keeps a batch whole when its invoice number,
  recorder or note matches, otherwise only its matching lines, and drops
  batches left empty (`features/consignments/goods-filter.ts`).
- **Carried only, on by default.** A plain visit shows only items still
  carried. Unticking sends `carried=0` through a hidden field, the same
  pattern as the stock minimum filter, so the choice survives in the URL.
- **Filtering stays in the page.** One consignment's balances and batches
  are already loaded whole, so the filter runs in memory rather than in SQL.
- **Dialogs keep the filters.** Take, reduce, return, sell and the invoice
  dialog open and close on the filtered URL. The forms still offer every
  item still carried, whatever the filter shows.

## Consequences

- The page opens shorter: sold-out rows stay out of the way until asked for.
- A count "x dari y barang" shows that rows are hidden.
- Saving a form still returns to the plain page, which resets the search.
