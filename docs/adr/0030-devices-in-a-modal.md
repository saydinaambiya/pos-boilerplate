# ADR-0030: Devices list in a modal over the current page

- Status: Accepted
- Date: 2026-09-29
- Requirements: PRD FR-AUTH-10, FR-UX-01; BRD Q-31
- Complements: [ADR-0018](./0018-dialogs-and-auto-filters.md)

## Context

The devices icon in the account card led to the `/devices` page. Users
wanted it to open as a modal over whatever page they are on. ADR-0018
dialogs open through a search parameter on their host page, but the
account card sits in the shared layout, which cannot read search
parameters and has no single host page.

## Decision

- **Intercepting route in a parallel slot.** The signed-in layout renders
  a `@modal` slot. `@modal/(.)devices` intercepts a client-side navigation
  to `/devices` and shows the list in a `RouteDialog` over the current
  page. A reload or a shared link to `/devices` still renders the full
  page.
- The slot's `default`, its root `page` and its `[...segments]` catch-all
  render nothing, so the modal closes when the user navigates elsewhere.
  The catch-all shares the param name of the placeholder catch-all, which
  Next.js requires to tell the routes apart.
- `RouteDialog` accepts no `closeHref` for an intercepted route and closes
  with `router.back()`.

## Consequences

- The URL shows `/devices` while the modal is open, so back closes it and
  forward reopens it.
- Other layout-level dialogs can reuse the `@modal` slot the same way.
- Closing goes back to a page the router shows from its cache before the
  `popstate` event arrives. The global loading indicator therefore starts
  on back or forward only while the target URL is not rendered yet;
  otherwise it stays up until its 15-second timeout (FR-UX-08).
