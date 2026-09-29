# ADR-0029: Salespeople keep a shift but not the cashier

- Status: Accepted
- Date: 2026-09-29
- Requirements: PRD FR-CSG-01/04, FR-SHF-01..03, FR-SET-09; BRD BR-27, Q-30
- Amends: [ADR-0024](./0024-consignment-roles.md), where the Sales role got the cashier

## Context

Recording sold goods takes money, and money must land in an open shift.
The only way to have a shift was the cashier (`page:pos`), so the seeded
Sales role got the cashier. With it, and with the after-hours permission,
a salesperson could sell the store's own stock at the terminal, even at
night, instead of only the goods they carry.

## Decision

- **A shift no longer needs the cashier.** Opening, closing and reading
  one's own shift accept `page:pos` or `consignment:sell`. A salesperson
  without the cashier opens and closes their shift in a "My shift" panel
  on the Sales page. The panel reuses the cashier's open form and close
  dialog, so the expected cash, the counted cash and the variance work the
  same way.
- **Consignment sales skip the cashier check.** `checkout` accepts
  `consignment:sell` in place of `page:pos` only when it settles a
  consignment. An ordinary sale still needs `page:pos`, so a salesperson
  cannot sell shelf stock. Transfer accounts and the QRIS account are
  readable with either permission.
- **The Sales role loses the cashier.** Its seed is `page:consignments`,
  `consignment:sell` and `pos:after-hours`. Migration 0025 removes
  `page:pos` from an existing role named "Sales" that sells consignments;
  other roles are left as the owner set them. After-hours work now only
  covers opening a shift and recording sold goods.

## Consequences

- A salesperson's sold goods still become sales in their own shift and
  count in the recap per employee. The detail page asks them to open a
  shift first when none is open.
- A role given both `page:pos` and `consignment:sell` can still sell shelf
  stock at the cashier. That is the owner's choice to make.
