# ADR-0014: Sales reports, cost snapshots and CSV export

- Status: Accepted; recap layout amended by [ADR-0032](./0032-money-recap-and-atm-deposits.md)
- Date: 2026-09-26
- Requirements: PRD §3.11, FR-DSH-01, FR-RPT-01..05, FR-UI-11

## Context

Reports need to aggregate POS sales, store credit and marketplace orders
over store-local days, show gross profit to some viewers only, and export
CSV. Profit computed from today's product cost would change past figures
whenever the owner edits a cost.

## Decision

- **Cost snapshot**: `sale_items.unit_cost` and `online_order_items.unit_cost`
  store the variant cost (override or product cost) at sale time. Migration
  0011 backfills existing rows with the cost current at migration time.
- **What counts**: POS sales except `VOIDED` (including those with store
  credit); marketplace orders except `CANCELLED` and `RETURNED`. Ranges are
  whole store days in the configured time zone, at most 366 days; invalid
  input falls back to the current month.
- **Figures**: net sales = grand total − PPN − service, so it compares with
  cost of goods even for tax-inclusive prices. Gross profit = net sales −
  cost of goods. Per product, variant and category the margin is line
  total − cost, before voucher discounts and tax; this is labelled as
  such. The payment method table combines settled POS payments, store
  credit given (`KASBON`) and marketplace order totals; approved store
  credit installments are listed separately by approval time.
- **Access**: the page needs `page:reports`, the data `report:view`.
  Cost, margin and gross profit are removed from the result (not just
  hidden) without `report:view-profit`, so CSV exports cannot leak them.
  The dashboard's today figures need `report:view`.
- **CSV**: one file per section at `GET /api/v1/reports/{section}`,
  streamed with a UTF-8 BOM, integer rupiah amounts, RFC 4180 quoting and
  formula neutralisation (a leading `=`, `+`, `-`, `@` gets an
  apostrophe). Nothing is stored on the server.

## Consequences

- Changing a product cost never rewrites past profit.
- Rows imported before migration 0011 carry the cost of that moment, not
  their true historical cost.
- Report queries aggregate live tables; if data grows beyond what the
  free tier handles comfortably, housekeeping (FR-HK) and summary tables
  are the next step.
