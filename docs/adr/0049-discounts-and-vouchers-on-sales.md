# ADR-0049: Discounts and vouchers on Sales, motif in the cut history

- Status: Accepted
- Date: 2026-10-14
- Requirements: PRD FR-CSG-04, FR-POS-02, FR-POS-03, FR-ROL-03; BRD Q-55
- Amends: [ADR-0029](./0029-sales-without-the-cashier.md) (Sales without
  the cashier)

## Context

A salesperson recording goods sold could not give a discount. The cashier
can give a discount per line (`pos:item-discount`) and take one voucher per
sale. The store wants both to work the same way on Sales.

The cut history on Cut Rolls named the roll by brand, product and colour.
It did not show the motif, so lookalike rolls were hard to tell apart.

## Decision

- **Same rules as the cashier.** Each sold line in "Catat terjual" can take
  a discount in percent or rupiah, behind the same tag button, for holders
  of `pos:item-discount`. One voucher code can be applied to the sale. The
  discount editor, the voucher field and the totals list are exported from
  the cart panel and reused by the Sales form.
- **Salespeople get the permission.** The seeded Sales role now holds
  `pos:item-discount`. Migration 0039 grants it to an existing Sales role
  that still sells carried goods, like migration 0029 did for store credit.
  The owner can take it away per role.
- **The server prices it.** The settlement passes line discounts and the
  voucher code to `checkout`. Before that, `settleGoods` checks the voucher
  and its minimum purchase, then computes the total so that the payment
  amounts match. The checkout validates the voucher again under lock and
  counts its use.
- **Voucher checks without the cashier.** `previewVoucher` and
  `checkVoucherAction` accept `page:pos` or `consignment:sell`.
- **Motif in the cut history.** Each cut reads "Brand · Product · Motif ·
  Colour", with the motif read live from the product.

## Consequences

- The permission label of `pos:item-discount` now names Sales too.
- Discount and voucher errors on Sales show the same messages as at the
  cashier.
- The shared pieces stay in `cart-panel.tsx`. A separate module pushed the
  POS terminal over its JavaScript budget (NFR-PERF-02).
