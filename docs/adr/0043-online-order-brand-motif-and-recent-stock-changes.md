# ADR-0043: Brand, motif and colour on online orders and Sales pages, recent stock changes

- Status: Accepted
- Date: 2026-10-12
- Requirements: PRD FR-ONL-09, FR-CSG-08, FR-STK-10; BRD Q-49
- Amends: [ADR-0042](./0042-reduce-goods-carried-and-motif.md) (brand and colour next to motif)
- Relates to: [ADR-0013](./0013-online-orders.md)

## Context

Online order cards and the order detail showed only the product name and
colour, so staff could not tell lookalike goods apart. The Sales pages
showed the motif but not the brand, unlike the product, stock and Cut
Rolls lists, and the colour only inside the item name. Users liked the
recent cuts on Cut Rolls and the history of goods carried by salespeople,
and asked for the same on the stock menu. The stock ledger was only
visible one variant at a time.

## Decision

- **Brand, motif and colour are read live.** They come from the product
  and the line's variant, as ADR-0042 does for the motif, so existing
  records show them too. No snapshot column is added. A piece carries its
  roll's colour (FR-ROL-01).
- **Colour gets its own place.** Where colour has a column or a details
  line, the item name drops it and keeps the size and defect flag:
  "Karpet · 93cm x 47cm".
- **Online orders.** The detail gets Brand, Motif and Colour columns; a
  card shows "Brand · Motif · Colour" of the first item under the item
  summary.
- **Sales pages.** The balance table reads Brand, Item, Motif, Colour like
  the stock list. Each history line shows "Brand · Motif · Colour" under
  the item. The pickup lines and the sell, return and reduce forms read
  "Name · Brand · Motif · colour · size", the order the POS details line
  uses.
- **Recent stock changes beside the stock list.** The stock page gets a
  side card with the latest 30 movements of every variant, newest first,
  laid out like the recent cuts: the goods, brand and motif, the movement
  type and signed amount, the stock after it, the note, the time and who
  made it. Each entry links to that variant's full, filterable history
  (FR-STK-06). Archived movements are left out, like the ledger default.
- **Same permission.** `page:stock`, which already shows every variant's
  ledger.

## Consequences

- No migration.
- If a product's brand, motif or colour changes later, old orders and
  consignments show the new values.
- Goods without a colour show "—" in the Colour column and leave it out of
  the details line.
- A roll cut shows as several entries, one for the roll and one per piece
  size, because each is its own movement.
