# ADR-0021: Product brand, motif and size

- Status: Accepted; size per product superseded by [ADR-0023](./0023-roll-stock.md)
- Date: 2026-09-28
- Requirements: PRD FR-PRD-04, FR-PRD-06, FR-CAT-02, §3.16; BRD BR-28, Q-09, Q-10

## Context

Users asked for fuller product details: brand, motif, colour, SKU and size
(length × width in cm: 93×47, 100×70, 50×140 and 100×140). Colour and SKU
already exist on colour variants (ADR-0008). They also asked that the Sales
menu say "terjual" (sold) instead of "laku", in less stiff wording.

## Decision

- **Size is on the product.** One product has one size, and another size is
  a separate product. Variants stay colour only, so stock, the POS picker and
  every ledger keep working unchanged. `products.size` is a text code
  (`93x47`, …) validated against `PRODUCT_SIZES` in code. There is no
  database check: adding a size is a code change with a release, as agreed.
- **Brand is a managed list.** A new `brands` table (unique by lowercase
  name) is linked from `products.brand_id` with `ON DELETE RESTRICT`. It is
  managed on a Brands tab. It first shared `category:manage`; since
  ADR-0022 removed categories the permission is `brand:manage`. A brand
  that products use cannot be deleted.
- **Motif is free text** (`products.motif`, at most 60 characters).
- **Required for new products only.** The create form validates with
  `newProductInput`, which requires all three. Edits accept empty values, so
  products made before this change can still be saved; the edit page says
  when details are missing. At the service level the fields are optional,
  and an edit that omits them keeps the stored values.
- **Where the details show.** The product list has Brand and Size columns
  and filters, with the motif under the name. The POS grid, variant picker,
  pickup search and marketplace order search show "brand · motif · size".
  Searches on the product list and at the POS also match brand and motif.
  Receipts print them under each line (see Consequences).
- **Wording.** In the Sales menu, "laku" becomes "terjual" and "kembali"
  becomes "dikembalikan". Other lines are rewritten in plain everyday
  language in both locales.

## Consequences

- Each sale line freezes the details as `sale_items.details_snapshot`
  ("brand · motif · size"), like the name and colour. Receipts (58/80 mm,
  A4, PDF) and the sale dialog print it under the product name. Later edits
  to the product do not change past receipts, and older sales have none.
- Existing products stay valid with empty details. They can be completed
  later from the edit page.
