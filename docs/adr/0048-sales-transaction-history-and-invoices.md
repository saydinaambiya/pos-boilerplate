# ADR-0048: A transaction history for salespeople, with full invoices

- Status: Accepted
- Date: 2026-10-14
- Requirements: PRD FR-CSG-10, FR-POS-13, FR-INV-04; BRD Q-54
- Amends: [ADR-0029](./0029-sales-without-the-cashier.md) (Sales without
  the cashier)

## Context

A salesperson's sales showed only inside the dated goods history of each
consignment, as a line "Transaksi INV-…". The cashier's transaction history
(`/pos/sales`) and the sale detail with print and PDF need `page:pos`. The
Sales role has no cashier (ADR-0029), so a salesperson saw the invoice
number but could not open the invoice.

## Decision

- **A third tab on the Sales page.** "Riwayat transaksi" sits beside
  "Sedang dibawa" and "Selesai" at `/consignments/sales`. It lists the sales
  of carried goods with the same layout, filters and paging as the
  cashier's history. The filter and table are shared components. A
  salesperson sees only their own sales. Pickup and return staff see
  everyone's, with a Sales column and a salesperson filter. Only the
  "Selesai" and "Kas bon" statuses are offered, since these sales cannot be
  voided (FR-CSG-06).
- **Full invoices for salespeople.** `getSale` also opens a sale of carried
  goods to `page:consignments` holders who may see that salesperson's goods:
  the salesperson, or pickup and return staff. The cashier rule is
  unchanged. The print page and the share link action accept `page:pos` or
  `page:consignments`, and then rely on `getSale`.
- **The goods history keeps its sold entries.** On a consignment's page the
  "Transaksi INV-…" line now opens the sale dialog over the page
  (`?sale=`) for everyone who sees the page.

## Consequences

- `SaleListQuery` takes an optional consignment filter. The sale list and
  detail carry the salesperson of the consignment.
- `seesEveryConsignment` moves to `features/consignments/access.ts` so the
  checkout feature can use it without a circular import.
- Salespeople without the cashier who leave the print page go back to the
  Sales history, not to `/pos/sales`.
