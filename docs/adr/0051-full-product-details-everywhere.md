# ADR-0051: Full product details wherever goods are listed

- Status: Accepted
- Date: 2026-10-17
- Requirements: PRD FR-PRD-09, FR-PRD-08, FR-ONL-09, FR-CSG-08, FR-RPT-01;
  BRD Q-57
- Builds on: [ADR-0043](./0043-online-order-brand-motif-and-recent-stock-changes.md)
  (brand and motif on online orders) and
  [ADR-0047](./0047-brand-beside-names-and-optional-credit-phone.md) (brand
  beside product names)

## Context

The products page lists every product with its brand, name, motif, colour
and thickness, and pieces cut from a roll with their size and defect flag.
Other pages showed only part of that. When an item was added to a new
online order, its line showed brand, name, colour and size, but no motif.
The low-stock widget, the stock page of one variant, the cut dialog and the
sales report showed no motif either. Thickness was missing outside the
products and stock tables.

## Decision

- **Motif wherever goods are listed.** Each page above now shows the motif.
- **Thickness where the user works with orders, the cart and figures.**
  Online orders (entry form, board card, item table, return labels), the
  low-stock widget, the cashier's cart and the sales report also show the
  thickness, so they carry the same details as the products page: brand,
  name, motif, thickness, colour and size (or defect).
- **Not on stock, Cut Rolls or Sales goods.** The user did not ask for
  thickness on the stock history and variant page, Cut Rolls or a
  salesperson's goods and forms. Those pages keep their columns, with the
  motif added only where it was missing (the cut dialog, the variant page).
- **Labels.** The online order table gains a Thickness column. Card and
  list rows add a labelled line, for example "Motif: Mihrab · Ketebalan:
  8mm", built by `traitsLine` in `lib/format/variant-label.ts`. Form labels
  add the details inline, for example "Fox · Karpet — Mihrab · 8mm · Merah ·
  93cm x 47cm".
- **Read live, like brand and motif.** Thickness comes from the product at
  read time, as brand and motif already do (ADR-0042, ADR-0043). Sale lines
  keep their frozen details line (`details_snapshot`), which already holds
  motif and thickness.
- **The sales report CSV** gains Motif and Thickness (mm) columns for
  products and variants.

## Consequences

- Goods that differ only by motif or thickness can be told apart on online
  orders, in the cart and in the report.
- Changing a product's thickness changes how earlier online orders read, as
  it already does for brand and motif.
- Form labels and the cut dialog title are longer; end-to-end tests match
  the new labels.
