# ADR-0040: Brand-first stock and cutting lists, with colours on products

- Status: Accepted
- Date: 2026-10-01
- Requirements: PRD FR-PRD-04, FR-STK-08, FR-ROL-03; BRD Q-46
- Amends: [ADR-0038](./0038-grouped-product-and-stock-lists.md) (stock grouping), [ADR-0023](./0023-roll-stock.md) (the Cut Rolls list)

## Context

After release 1.5, users said three lists still did not read like the
product list. The product list had no colour column, so they had to open a
product to see its colours. The stock list grouped per colour row with the
brand only as a column, so a brand's rolls were scattered by product name.
The Cut Rolls list was flat, with brand and motif squeezed under the roll
name, no colour column and no pieces.

## Decision

- **Colours on products.** The product list gets a "Warna" column after
  motif, listing the active colours of the product in colour order. A
  product without colours shows "—".
- **Three levels: brand, product, pieces.** The stock list and the Cut
  Rolls list are sorted by brand (unbranded last), then product and colour
  order, like the product list. Each brand has a header row with a tag
  icon, the brand name and a count, and opens or closes its rows. Under it
  sits one row per roll (or per variant of a non-roll product) with
  product, motif and colour columns, whose toggle opens the roll's pieces.
- **Cut Rolls columns.** Brand, product, motif, colour, SKU, length left
  and the Cut button. Piece rows show the size, "Cacat" for defect pieces,
  the colour and the pieces in stock.
- **Open state.** Both levels start closed, so the first view is one row
  per brand, and open by themselves once a search (or, on stock, the low
  or defect filter) applies. The default minimum filter on stock does not
  count, as in ADR-0038.
- **Nested toggle.** `TableSubGroup` renders the second level as bare
  rows inside a brand's `<tbody>`, since a `<tbody>` cannot nest. It shares
  the toggle row of `TableGroup`.

## Consequences

- Finding a roll to cut now takes a click on its brand, or a search.
- Paging still counts rows of the second level, so a brand can carry over
  to the next page.
- The Cut Rolls list loads the pieces of the listed rolls in one extra
  query.
