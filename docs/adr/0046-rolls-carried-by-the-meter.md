# ADR-0046: Rolls carried by the meter, a search-first Sales form

- Status: Accepted
- Date: 2026-10-13
- Requirements: PRD FR-CSG-09, FR-POS-13, FR-RPT-01; BRD Q-52
- Amends: [ADR-0023](./0023-roll-stock.md) (rolls stay at the store),
  [ADR-0020](./0020-field-sales-consignments.md) (quantities are pieces)

## Context

Salespeople could only take whole pieces. The store also sells rolls by
the meter as custom cuts (FR-ROL-04), and salespeople wanted to do the same
outside the store. The form that records sold, returned and reduced goods
listed every carried item with an input. On a phone, finding one item in a
long list was slow.

## Decision

- **A roll is carried by the meter.** A consignment line on a roll row
  counts centimetres, like the roll's stock. Pickup, sale, return and
  reduction all count in cm. The forms take meters ("2,5") and show `2,5m`.
  Pickups move the cm off the roll through `CONSIGNMENT_OUT` under the
  normal stock rules. Returns and reductions put them back. A
  consignment line stores the price per meter.
- **Sold meters are a custom cut.** The meters sold in one settlement become
  one checkout line with `qty = 1` and `length_cm` set, priced by
  `cutPrice` like at the POS. The sale writes no stock movement, as with
  every consignment sale.
- **Totals keep pieces and meters apart.** The Sales list shows pieces and
  meters as separate amounts. A roll's value is cm × price per meter ÷ 100.
- **Search, then amount.** The sell, return and reduce forms open with a
  searchable dropdown of the goods still carried. The user picks one item.
  It is added as a line with its amount input focused and a remove button.
- **kg goods still stay at the store** ([ADR-0045](./0045-accessories-and-goods-sold-by-the-kg.md)).

## Consequences

- No migration is needed. Consignment quantities accept up to 100.000, so
  1.000m fits.
- `takeGoods` reports insufficient roll stock in cm with `isRoll`, and the
  message shows meters.
- Marketplace orders still take pieces only.
