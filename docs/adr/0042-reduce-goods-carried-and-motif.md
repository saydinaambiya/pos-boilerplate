# ADR-0042: Reduce goods carried by mistake, motif on salespeople's goods

- Status: Accepted
- Date: 2026-10-07
- Requirements: PRD FR-CSG-03, FR-CSG-07, FR-CSG-08; BRD Q-48
- Amends: [ADR-0020](./0020-field-sales-consignments.md) (outstanding formula, batch kinds)

## Context

Pickup staff could only add goods to a salesperson's load. When they
entered too many, the only fix was to record a return, which the history
then showed as goods brought back, and which needed `consignment:return`.
Users also could not tell lookalike goods apart on the Sales pages,
because the motif was missing.

## Decision

- **Reduce is its own record.** A `REDUCE` batch with `REDUCE` items takes
  goods off the load. Outstanding becomes Σ TAKE − Σ SOLD − Σ RETURN −
  Σ REDUCE. "Diambil" on the detail page shows pickups net of reductions,
  so it reads as what the salesperson really took. The history keeps the
  correction as its own dated entry. Batches stay immutable.
- **Same path as a settlement.** `reduceGoods` reuses the settlement write:
  the row lock on the consignment, the check against what is outstanding,
  closing at zero, idempotency per actor and key, and store hours. The
  goods go back on the shelf through `CONSIGNMENT_RETURN`, because they
  never left the store. A new movement type would add nothing.
- **Who.** `consignment:pickup`, the permission that records pickups. No
  new permission is needed.
- **Motif is read live.** The balance table gets a Motif column. The
  pickup form, the sell, return and reduce forms and the history show it
  after the product name. It comes from `products.motif` through the
  variant rather than a new snapshot column, so existing records show it
  too. A motif is rarely edited after goods go out.

## Consequences

- Migration 0034 adds `REDUCE` to `consignment_batch_kind` and
  `consignment_item_kind`.
- The audit log records `consignment.reduced`.
- If a product's motif is changed later, old consignments show the new
  motif.
