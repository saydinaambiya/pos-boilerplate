# ADR-0009: Sale calculation, rounding and inclusive tax

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §5, BR-08, BR-09, BR-14, BR-22, FR-POS-04, FR-SET-04

## Context

PRD §5 fixes the order of operations for exclusive prices and states that
inclusive PPN splits a total into `tax_base = total / (1 + rate)` and
`ppn = total − tax_base`. It does not say how a service charge combines with
inclusive prices, and all money must stay exact up to billions of rupiah.

## Decision

- `src/lib/money/calculate.ts` is the single, pure implementation used by the
  POS preview and the checkout service; the server always recomputes.
- Money is integer rupiah, rates are integer basis points. Rate products use
  `BigInt`, so `Rp 999.999.999.999 × 100 %` stays exact. Every step that
  yields a fraction rounds half-up to the rupiah.
- Percentage item discounts apply to the whole line (once, not per unit) and
  are clamped to the line; vouchers apply to the subtotal, honour minimum
  purchase and maximum discount, and are clamped to the subtotal.
- Exclusive prices: `net → service = net × s → tax_base = net + service →
ppn = tax_base × p → grand = tax_base + ppn`.
- Inclusive prices: the shelf price already contains PPN, so
  `pre_tax = net / (1 + p)` and the PPN inside the price is `net − pre_tax`.
  A service charge is computed on `pre_tax` and is itself subject to PPN:
  `grand = net + service + service × p`, `tax_base = pre_tax + service`,
  `ppn = (net − pre_tax) + service × p`. Without a service charge the grand
  total equals the shelf price exactly, as PRD §5 requires.
- The inclusive flag is ignored when PPN is disabled.
- Tax configuration (rates, inclusive flag) is snapshotted on each sale.

## Consequences

- Receipts show a tax base and PPN that add up to the grand total in both
  modes.
- Changing tax settings never alters past sales.
