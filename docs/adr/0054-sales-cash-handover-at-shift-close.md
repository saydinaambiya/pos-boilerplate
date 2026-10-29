# ADR-0054: Sales cash handed over to the store drawer at shift close

- Status: Accepted
- Date: 2026-10-29
- Requirements: PRD FR-SHF-03, FR-RPT-07; BRD Q-50
- Amends: [ADR-0029](./0029-sales-without-the-cashier.md), [ADR-0032](./0032-money-recap-and-atm-deposits.md), [ADR-0044](./0044-shared-store-shift.md)

## Context

Under ADR-0044 and ADR-0029, salespeople keep shifts apart from the store's shared drawer shift and open without a float. Cash collected by salespeople on the road was kept separate from the store drawer cash, appearing in sales reports but never entering the cash drawer or the store drawer shift expected cash.

In practice, salespeople bring cash back to the store and hand it directly to the cashier when they return and close their sales shift. The store requested that:

1. Physical cash counted and handed over when a salesperson closes their shift (`countedCash`) should directly enter the store drawer balance.
2. The cash drawer should not expect the sales cash throughout the day while the salesperson is still on the road, preventing false drawer shortages during the day.
3. The store's shift report and daily money recap should clearly show cash handed over from sales shifts as a drawer inflow.

## Decision

- **Handover at sales shift close.** When a salesperson closes their shift (`kind = "SALES"`), the counted cash (`countedCash`) is recorded as physically handed over to the store drawer.
- **Attachment to the store drawer shift.** Under the drawer lock (`lockDrawer`), closing a sales shift attaches `handover_to_shift_id` pointing to the currently open drawer shift (`handover_after_close = false`). If the store drawer shift has already closed for the day (e.g. night return), it attaches to the last closed drawer shift with `handover_after_close = true`.
- **Expected cash calculation.** The store drawer shift's expected cash includes `salesHandovers` (the sum of `counted_cash` from sales shifts handed over during that shift). If handed over after the drawer shift closed, `lastClosedDrawerShift` automatically adds it to the drawer leftover, which rolls into the next morning's `carriedCash`.
- **Shortages stay with the salesperson.** Because only the physical `countedCash` is transferred to the drawer, any variance or shortage on the sales shift remains recorded on the salesperson's shift and does not penalize the cashier's drawer.
- **Reporting and recap visibility.**
  - `shiftTotals` includes `salesHandovers`, displayed on the drawer shift figures and reports.
  - Daily money recap (`getCashRecap`) counts `salesHandovers` from closed sales shifts as a cash inflow to the drawer (`drawerChange`, `drawer.salesHandover`, and final daily drawer balance).
  - Shift closing dialog informs salespeople that the counted cash will be handed over to the cashier/drawer.

## Consequences

- Migration `0042_sales_cash_handover.sql` adds `handover_to_shift_id` (nullable uuid referencing `shifts.id`) and `handover_after_close` (boolean default `false`) to the `shifts` table, with an index on `handover_to_shift_id`.
- The store drawer accurately reflects cash handed over by salespeople without mid-day discrepancy.
- Cash recap and shift figures align with real physical drawer contents.
