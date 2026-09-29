# ADR-0026: Listed motifs and colours, and defect pieces

- Status: Accepted
- Date: 2026-09-29
- Requirements: PRD FR-PRD-06, FR-VAR-01/03, FR-ROL-05, FR-STK-01; BRD BR-29, Q-22..Q-24

## Context

Users asked for motifs and colours to be picked from fixed lists in a
searchable dropdown instead of typed. Motif 3D has children (Catur, Wave,
and so on). They also cut defect goods from rolls: those pieces belong to
the same product, must be flagged, and sell at a different price. They
want to see the defect stock on its own.

## Decision

- **Lists in code.** `src/features/catalog/options.ts` holds `MOTIFS`, with
  3D children stored as `3D Catur` and so on, and `COLORS`, each with a
  swatch hex. As with sizes, a new entry ships with a release. New products
  must use a listed motif. A new colour must be a listed colour, and its
  hex is filled in, so the hex field is gone. An edit keeps a value from
  before the lists, and the dropdown shows it, so older products stay
  editable.
- **Searchable dropdown.** `Combobox` is a Radix popover with a search box
  that filters by label or group, and supports arrow keys, Enter and
  Escape. It posts through a hidden input like `Select`. Options can sit
  under a group heading, which is how 3D shows its children, and can carry
  a swatch drawn as an SVG `fill` (FR-VAR-03). `FormCombobox` lives in its
  own module, so pages without it, such as the POS terminal, do not load
  it (NFR-PERF-02).
- **Defect pieces are variant rows.** A defect piece is a child of the roll
  with `is_defect`, one per size. It is created the first time a defect
  cut needs it, with the SKU `base-size-D`, and it follows the roll's SKU,
  colour and status like the normal pieces do.
  - The unique piece index is `(parent_id, size, is_defect)`.
  - The price comes from `products.defect_size_prices`: one price per
    size, the same for every colour, required for new products. It falls
    back to the normal price while none is set. The cost is the same as
    the normal piece's.
  - Enabling colours moves defect stock like any piece.
- **The cut flags itself.** The cut form's "Barang cacat" checkbox makes
  `defect: true`, and every piece of that cut is booked on the defect rows.
  A cut with both kinds is recorded as two cuts. The history marks defect
  cuts.
- **Where defects show.** The POS picker lists defect pieces beside the
  normal ones with a "Cacat" badge and their own price. Sale, consignment
  and order snapshots add "Cacat" ("Defect" in English, with the store
  default in snapshots). The stock page labels defect pieces and has a
  "defect stock only" filter.

## Consequences

- Existing roll products have no defect prices, so they sell defects at
  the normal price until the owner fills them in.
- Colour names from the list are English (Red, Blue, …), as given by the
  users. Earlier colours such as "Merah" keep their names.
