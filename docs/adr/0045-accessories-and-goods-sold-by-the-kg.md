# ADR-0045: Accessories, and goods sold by the kg

- Status: Accepted
- Date: 2026-10-12
- Requirements: PRD FR-PRD-07; BRD Q-51
- Relates to: [ADR-0023](./0023-roll-stock.md) (rolls sold per meter)

## Context

The store also sells goods other than carpet rolls, such as glue and
thread. They need a brand, a name and a colour from the existing colour
list, and a unit of pcs, ml or kg. Every new product was a roll with a
motif, a thickness and piece prices, so there was no way to add them. The
user asked that ml and kg may be sold in fractions.

## Decision

- **A category on the product.** `products.category` is `MAIN` for the
  store's goods (rolls and older plain products) or `ACCESSORY`. The new
  product dialog has a "Karpet roll" and an "Aksesoris" switch
  (`?category=ACCESSORY`). An accessory has a brand, a name, a first
  colour from the colour list, a unit of pcs, ml or kg, a price per unit,
  a SKU and a minimum stock. It has no motif, thickness or sizes, it
  always tracks stock, and its unit is fixed once saved because its stock
  is counted in it.
- **ml is a whole unit.** A price per ml and whole ml are fine-grained
  enough (250 ml), so ml goods are sold like pcs.
- **kg is weighed like a roll is cut.** Stock, minimum stock and stock
  movements of a kg accessory are kept in grams, the way a roll keeps
  centimetres, and typed and shown in kg with up to three decimals
  (`0,5kg`). At the POS the cashier picks the colour, then types the
  weight; the line is priced per kg and rounded to whole rupiah
  (`weighPrice`). `sale_items.weight_g` keeps the weight next to
  `length_cm`, a void puts the grams back, and the invoice prints the
  weight.
- **One helper for quantities.** `stockMeasure` tells whether a row counts
  meters, kg or whole units, and `formatStock` and `parseStock` read and
  show amounts accordingly on the product, stock and dashboard pages.
- **kg goods stay at the POS.** Online orders and salespeople's goods
  take whole quantities only, so kg goods are left out of their product
  search and refused by their services, as rolls already are.

## Consequences

- Migration 0036 adds the `product_category` enum, `products.category`
  (existing products become `MAIN`) and `sale_items.weight_g`.
- Selling kg goods online or through salespeople needs another decision
  if the store asks for it.
