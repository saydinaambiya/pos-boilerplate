# ADR-0024: Store staff record salespeople's goods

- Status: Accepted
- Date: 2026-09-29
- Requirements: PRD FR-CSG-01/04/05, FR-SET-09, §2.2; BRD BR-24, BR-27, Q-16, Q-17
- Amends: the "Who" section of [ADR-0020](./0020-field-sales-consignments.md) and the Owner-only exemption of [ADR-0019](./0019-devices-hours-and-loading.md)

## Context

Salespeople should not manage stock. They receive goods and sell them. One
role records what they take (for example Admin) and another records what
they bring back (for example Pramuniaga). Salespeople may only see what they
received and returned, and record what they sold. They also work outside
store hours, apart from the regular cashier.

## Decision

- **Three permissions replace `consignment:take` and `consignment:manage`:**
  - `consignment:pickup` records pickups for any salesperson.
  - `consignment:return` records returns for any salesperson.
  - `consignment:sell` makes an account a salesperson, who sees only their
    own goods and records what they sold, with the buyer and payment.

  Pickup and return staff see every salesperson's goods. The Owner may do
  everything, including recording a sale for a salesperson.

- **One settlement path, split by permission.** `settleGoods` is unchanged
  in shape. A request with sold lines needs `consignment:sell` on one's own
  goods, and a request with returned lines needs `consignment:return`. The
  UI offers two dialogs: **Catat terjual** for the salesperson and **Catat
  pengembalian** for the shop floor.
- **After hours is a permission.** `pos:after-hours` exempts a role from
  store hours (FR-SET-09), just like the Owner. It is not tied to a role
  name, so the owner decides who may work late.
- **Starter roles.** `pnpm db:seed` creates `Admin` (pickup), `Pramuniaga`
  (return) and `Sales` (sell, POS, after hours) if they do not exist yet.
  They are ordinary roles the owner can change. Migration 0020 moves
  existing grants: `take` becomes `sell` plus `pos:after-hours`, and
  `manage` becomes `pickup` plus `return`.

## Consequences

- A salesperson without POS access cannot record a sale, because taking
  money needs an open shift. The detail page tells them the store records
  the rest.
- Existing deployments need `pnpm db:seed` once to get the starter roles.
  The migration already carries over existing permissions.
