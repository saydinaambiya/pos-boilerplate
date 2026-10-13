# ADR-0047: Brand beside product names, an optional phone on store credit

- Status: Accepted
- Date: 2026-10-13
- Requirements: PRD FR-PRD-08, FR-POS-11, FR-KSB-01; BRD BR-11, Q-53
- Amends: [ADR-0012](./0012-store-credit.md) (customers keyed by phone),
  [ADR-0021](./0021-product-details.md) (brand in the details line)

## Context

Product names were shown without their brand in the cashier cart, the
transaction history, invoices and most pickers. The brand appeared only in
the smaller details line, or not at all. Lookalike goods from different
brands were hard to tell apart.

A sale's buyer phone was optional, but a store credit (kas bon) refused a
sale without one. Customers were re-selected by phone. The store asked for
the phone to be optional on every sale.

## Decision

- **Brand first, beside the name.** `brandedName` shows
  "Brand · Product". `variantLabel`, `stockItemLabel` and `goodsName` take
  the brand and use it. This covers the POS tiles, colour picker and cart,
  the transaction history, invoices (print and PDF), Sales pickups and
  settlements, marketplace orders, low stock, stock history, cut history and
  the product and colour editors. Where the brand now sits beside the
  name, it is left out of the details line below.
- **Lists grouped by brand stay as they are.** The products, stock and Cut
  Rolls lists already show the brand as the group heading. Tables with a
  Brand column keep that column.
- **The brand is frozen on sale lines.** `sale_items.brand_snapshot` stores
  the brand at sale time, like the name. The migration fills it for past
  sales from the current brand, but only when the stored details line
  starts with that brand. Receipts drop the brand from the frozen details
  line when it already shows beside the name.
- **The phone is optional on store credit too.** `customers.phone` may be
  null. A customer with a phone is still re-used by that phone. A customer
  without a phone gets a new row for each store credit. Customer
  suggestions at the POS only list customers with a phone.

## Consequences

- Two migrations: `customers.phone` drops `NOT NULL`, and
  `sale_items.brand_snapshot` is added and filled.
- The store credit list and detail hide the phone line when there is none.
- The CSV reports are unchanged. The recap already has a Brand column.
