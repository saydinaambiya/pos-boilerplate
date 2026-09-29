# ADR-0028: A home page for every role

- Status: Accepted
- Date: 2026-09-29
- Requirements: PRD FR-HOME-01, FR-DSH-01, FR-RBAC-02; BRD Q-29

## Context

Sign-in, the forbidden page and the not-found page all send users to `/`,
and `/` was the dashboard, which needs `page:dashboard`. A role without the
dashboard, such as the seeded Sales role, landed on "forbidden" straight
after signing in, and the "back" link led to the same page again.

## Decision

- **`/` is Home, for any session.** It greets the user with their role,
  store and date. It says whether the store is open today and whether they
  may work now (store hours and `pos:after-hours`, FR-SET-09). For cashier
  roles it shows the open shift, or a link to open one. It lists a
  shortcut for every page the role opens, taken from the same `navigation`
  list as the menu, so the two stay in step. A role with no pages is told
  to ask the Owner for access.
- **The dashboard moves to `/dashboard`**, still behind `page:dashboard`.
  "Home" is the one menu entry without a page permission, and a unit test
  keeps it the only one.

## Consequences

- Sign-in, change-PIN and error pages keep redirecting to `/`, which now
  always opens.
- Bookmarks of `/` land on Home; the dashboard is one tap away in the menu
  and on Home.
