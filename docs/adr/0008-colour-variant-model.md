# ADR-0008: Colour variant model and enabling variants

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD §3.1.1, FR-VAR-01..08, FR-STK-01..03

## Context

Every product has at least one variant so stock, sales and reports always
reference a variant. A product without colours uses a hidden default
variant. FR-VAR-06 says enabling variants moves the default variant's stock
to the first colour variant through a recorded `ADJUSTMENT`, while FR-VAR-05
says the default variant cannot be deactivated while the product is active.
Read literally, the two conflict: after the move the hidden default would be
an empty, unsellable row that may never be deactivated.

## Decision

- Enabling variants creates the first colour variant and **moves the default
  flag to it**. The hidden default is marked inactive and non-default; its
  stock is moved with two `ADJUSTMENT` movements (hidden → 0, first → +n)
  sharing the reference `variant-activation:<productId>`. Both ledgers stay
  complete and the total is unchanged.
- From then on "default variant" means the primary colour variant: it cannot
  be deactivated while the product is active (FR-VAR-05). Colour variants are
  never deleted.
- Colour lives in `attributes.color = { name, hex? }`, validated by Zod. The
  name is unique per product (index on `lower(attributes->'color'->>'name')`),
  the SKU globally. Swatches render the hex as an SVG `fill` attribute, never
  an inline style, so they need no CSP exception (FR-VAR-03).
- Price and cost overrides are nullable; `null` inherits from the product.
  Cost overrides follow the same visibility rule as product cost (FR-PRD-02).
- Opening stock of a new variant is an `IN` movement and requires
  `stock:adjust` in addition to `product:update`.
- Display order uses up/down buttons (plain forms, no client JavaScript) on
  every screen size. Drag and drop on desktop (FR-VAR-08, SHOULD) is deferred.
- Variants cannot be switched off again once enabled; deactivate colours
  instead.

## Consequences

- Product-level SKU and minimum stock fields disappear from the product form
  once variants exist; each variant owns them.
- Lists aggregate stock over active variants; a product is flagged low when
  any active variant is at or below its minimum.
