# ADR-0023: Rolls cut into pieces

- Status: Accepted
- Date: 2026-09-29
- Requirements: PRD §3.1.2 FR-ROL-01..04, FR-PRD-01/04/06, FR-STK-01; BRD BR-28, BR-29, Q-12..Q-15
- Supersedes: the one-size-per-product part of [ADR-0021](./0021-product-details.md)

## Context

Goods arrive as rolls, for example 40 m, always 140 cm wide. The store cuts
them into pieces of four fixed sizes (93×47, 100×70, 50×140, 100×140 cm). The
roll gets shorter and the pieces become stock, but the roll and its pieces
are one product. A roll is counted in meters and a piece in pcs. Buyers can
also ask for a custom length, such as 90 cm or 1.5 m, cut straight off the
roll at the cashier. Users also asked for a thickness in mm on every product.

ADR-0021 put one size on each product. That no longer fits: one roll now
yields all four sizes.

## Decision

- **Every stock row stays a variant.** Stock, sales, movements, consignments
  and reports keep referring to `product_variants`, so no ledger changes
  shape. On a roll product (`products.is_roll`), each colour is a **roll**
  row, and its stock is whole centimetres. Each of its four **pieces** is a
  child row (`parent_id`, `size`) counted in pcs, with the roll's colour
  copied. The hidden default variant of a product without colours is a roll
  with its own four pieces. Enabling colours moves the roll's and each
  piece's stock to the first colour as `ADJUSTMENT` pairs (ADR-0008). A
  roll's SKU is the base and a piece's SKU is `base-size`. A roll's pieces
  follow its SKU, colour and status.
- **Centimetres, not decimals.** Stock quantities stay integers. Screens
  show meters with up to two decimals (`38,5 m`) and read what users type in
  meters as centimetres. No numeric column is needed, and the conditional
  update against negative stock (FR-STK-03) works unchanged.
- **Prices.** On a roll product `price` and `cost` are per meter. The piece
  price of each size lives in `products.size_prices` (jsonb, Zod-validated),
  the same for every colour, as agreed. A piece's cost is the per-meter cost
  times the roll it uses. One SQL expression (`variantPriceSql`,
  `variantCostSql`) serves the POS, checkout, consignments and online
  orders.
- **A cut records the length cut off.** Each cut records how many meters
  were cut off the roll, for example 8 m, and how many pieces of each size
  that made. The roll loses exactly that length, and any offcut is the
  difference. `ROLL_USAGE_CM` in code is how much roll one piece normally
  uses across the 140 cm width: 100×140 uses 1.00 m, 50×140 uses 0.50 m,
  100×70 uses 0.50 m (two side by side), and 93×47 uses 0.47 m. It is used
  only for the piece cost and for a non-blocking warning when the pieces
  would need more than the length cut. A cut writes one negative `CUT`
  movement on the roll and one positive `CUT` per size, all sharing the
  idempotency key as reference. It locks the roll first, so a retry replays
  instead of cutting twice. It never goes negative, whatever
  `allowNegativeStock` says. Pieces receive stock only by cutting: `IN` on a
  piece is refused. The **Potong Roll** menu (`page:cutting`) lists the
  rolls and the latest cuts.
- **Custom cuts at the POS.** A checkout line on a roll row must carry
  `length_cm`, and a line on a piece must not. The unit price is the
  per-meter price times the length, rounded to whole rupiah (`cutPrice`,
  shared with the POS preview). The stock taken is `qty × length_cm`, and a
  void puts the same amount back. Rolls are not taken out by salespeople or
  sold through online orders. Only pieces are.
- **Thickness** is `products.thickness` (mm, up to two decimals). Brand,
  motif and thickness are required for new products and optional for older
  ones. Sale lines freeze brand · motif · thickness · size in
  `details_snapshot`. A custom cut prints its length, `Potong 90 cm`, from
  `sale_items.length_cm`.
- **Existing products** (migration 0020) that have a size and track stock
  become rolls. Each existing variant becomes the piece of its old size: it
  keeps its stock and history, and its SKU gets the size suffix. A new roll
  row takes over the old SKU and the default flag. The price per meter and
  the cost are converted from the old piece price. The other sizes get a
  proportional price, and the owner can edit all of them. Untracked sized
  products stay plain and keep their size on the variant. `products.size`
  is dropped (migration 0021).

## Consequences

- The product list shows motif and thickness as columns, the price per
  meter, and stock as roll meters plus pieces. The size filter is gone.
- A piece counts as low stock only once it has a minimum. Otherwise every
  uncut size would flag the product.
- Reports count a custom cut as one line of `qty`. Its length is on the
  sale line if a report ever needs meters sold.
- A custom cut that is voided goes back onto the roll as centimetres,
  because a void means the sale should not have happened.
