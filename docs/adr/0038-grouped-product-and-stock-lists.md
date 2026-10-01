# ADR-0038: Grouped product and stock lists, with a minimum for 93×47

- Status: Accepted
- Date: 2026-10-01
- Requirements: PRD FR-PRD-04, FR-STK-07, FR-STK-08, FR-STK-09, FR-ROL-05; BRD Q-44
- Amends: [ADR-0023](./0023-roll-stock.md) (how pieces are listed and which take a minimum)

## Context

In the demo after release 1.4, users found both lists too long. Each roll
showed up as one row for the roll and one row for every piece size, so a
handful of colours filled the whole stock page. They also said that two
things must always be in stock: the rolls and the 93×47 pieces. Only the
roll had a minimum stock, so a 93×47 piece running out was never flagged.

## Decision

- **Products grouped per brand.** The product list is sorted by brand,
  then name, with products that have no brand at the end. Each brand gets
  a header row with a tag icon, the brand name and its product count, and
  the header shows or hides that brand's rows. The brand column comes
  first, and groups start closed and open by
  themselves once a search or filter is applied. Paging is still 50 products per page, so a
  brand can carry over to the next page.
- **Stock grouped per product, motif and colour.** Each roll, or each
  variant of a non-roll product, is one group row with brand, product,
  motif, colour, stock and minimum. The SKU column is gone, though search
  still matches SKU, as well as product, brand, motif and colour. The
  pieces cut from a roll sit under its group row, closed by default so the
  first view stays short. They open on click, or by themselves as soon as
  a search or the low or defect filter is applied, because then the matching pieces are what
  the user is looking for. Paging counts groups, 50 per page.
- **Filters on groups.** A group is listed when its own row or one of its
  pieces matches the low, defect or minimum filter, and only the matching
  pieces are shown under it.
- **Minimum for 93×47 only.** On the stock page of a non-defect 93×47
  piece, a "Stok minimum" form, behind `stock:adjust` and audited as
  `stock.minimum-set`, takes the place of the goods-received card. Pieces
  never take goods in, so that card only explained that they come from
  cutting; that explanation is now a tip at the foot of the minimum card,
  which keeps the page to three cards. Other sizes and defect pieces keep
  no minimum, so uncut sizes are not flagged as low (ADR-0023). Once set,
  the piece is flagged as low on the list and on the dashboard, like a
  roll.
- **Minimum filter, on by default.** "Hanya yang ada stok minimum" shows
  only stock whose minimum is above 0, which in practice means the rolls
  and 93×47 pieces that must always be in stock. It starts ticked on a
  plain visit to `/stock` (menu, Reset, Back), with groups still closed.
  A hidden `minimum=0` field follows the checkbox, so unticking it stays
  in the URL. Links that arrive with a search or another filter, like the
  dashboard's low-stock link, start with it off and show everything.
- **Shared toggle.** `TableGroup` renders a group as its own `<tbody>`,
  with a toggle button that sets `aria-expanded`. Both lists use it.

## Consequences

- The first view of the stock page has one row per colour instead of five
  or more.
- A filtered stock view can show a roll row that does not match the filter
  itself, so that its matching pieces have a heading.
- Adding a minimum to another size would mean changing
  `MINIMUM_PIECE_SIZE` into a list, plus a new release.
