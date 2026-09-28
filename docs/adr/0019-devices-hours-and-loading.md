# ADR-0019: Device limit, store hours, buyer name and global loading

- Status: Accepted
- Date: 2026-09-28
- Requirements: PRD FR-AUTH-09/10, FR-SET-07/09, FR-POS-11, FR-UX-08, FR-UI-06; BRD BR-24..26, Q-05, Q-06

## Context

User feedback on v1.0 asked for five changes around the cashier: the buyer's
name (required) and phone (optional) on every sale, the signed-in account at
the top of the sidebar, a loading state everywhere, at most three signed-in
devices per account with a way to see and end them, and a POS that employees
cannot use outside opening hours.

## Decision

- **Buyer on the sale.** `sales.customer_name` and `sales.customer_phone` are
  snapshots, nullable only for sales made before the change. The
  `customers` table stays the store-credit directory keyed by phone: a
  credit sale still upserts its customer, and store credit needs the phone
  (BR-11), checked by a refinement on the checkout schema. The kasbon part of
  the checkout payload now only carries the note and due date.
- **Device limit.** A device is a live row in `sessions`. Login counts live
  sessions after verifying the secret, inside a transaction that locks the
  user row, so concurrent logins cannot take the same last slot. Over the
  limit the login is refused (not "sign out the oldest"): signing somebody
  out silently on a shared shop device was judged worse than asking. The
  limit is `operations.maxDevicesPerUser` (1–10, default 3). `sessions`
  gained `last_seen_at`, written together with the sliding expiry (at most
  every five minutes), for the device list. User agents are described by a
  small built-in parser; no dependency is worth it for "Chrome · Android".
- **Ending devices.** Anyone ends their own other devices from
  `/devices`; `employee:manage` ends an employee's devices from the employee
  page. The Owner's devices are only listed to the Owner, so a manager
  cannot lock the Owner out.
- **Store hours.** A new settings key `store.hours` holds seven days
  (Monday first) of `{ closed, open, close }` plus an `enabled` switch,
  default off so existing installations behave as before. Opening is
  inclusive, closing exclusive, evaluated in the store time zone; hours do
  not cross midnight. `storeClosedFor(session)` is the single check, used by
  the POS page, checkout, opening a shift and consignment writes. Closing a
  shift is never blocked, so a cashier can finish after hours. The Owner
  (system role) is exempt.
- **Global loading.** A client `LoadingBar` in the app layout shows a thin
  bar while a navigation or registered action is running. Navigations are
  detected from same-origin link clicks (capture phase) and `popstate`, and
  end when pathname or search params change, with a 15 s safety timeout.
  Actions register through `useGlobalPending(pending)`, wired into
  `SubmitButton`, `FilterForm` and the transition-based client forms. A
  route-level `loading.tsx` was rejected: its Suspense fallback would blank
  the list behind query-string dialogs (ADR-0018).
- **Sidebar.** The account card sits under the logo; theme and language stay
  at the bottom. The mobile drawer is unchanged.

## Consequences

- Test helpers reuse one session per account (`src/test/sessions.ts`), and
  the E2E seed clears fixture sessions and raises the device limit, because
  parallel specs sign the same fixtures in on many browser contexts. The
  limit itself is covered by integration tests.
- A user at the limit without another signed-in device needs the Owner (or
  the idle timeout) to free a slot; the refusal message says so.
- Enabling store hours affects everyone at once, so E2E only exercises the
  settings form; the blocking rules are integration-tested.
