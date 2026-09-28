# ADR-0003: Theming without client script under CSP

- Status: Accepted
- Date: 2026-09-25
- Requirements: PRD FR-UI-01..09, NFR-SEC-05

## Context

Palettes, layouts and default theme are chosen in `src/config/app.config.ts`.
Themes must not flash on load, must work before hydration, and must respect
a strict nonce-based Content Security Policy.

## Decision

- Palette tokens live in `src/config/palettes.ts` and are rendered to CSS
  custom properties at build time. Every palette is a static file at
  `/assets/palettes/<name>.<hash>.css` with an immutable cache; the layout
  links the one named in `app.config.ts`. The route never reads the config
  and the fingerprint is in the path: a single `/assets/palette.css?v=<hash>`
  route kept serving the previous palette in `next dev` after the config
  changed (static routes are cached by path), and browsers then kept that
  stale file for a year under the new URL. Unknown file names return 404
  with `no-store`.
  An inline `<style nonce>` was tried first and rejected: after a client-side
  locale switch React inserts the new document's `<style>` carrying a nonce the
  current page's CSP does not know, and the browser blocks it (caught by the
  CSP fixture in `e2e/fixtures.ts`).
- The theme (`light` / `dark` / `system`) is a cookie read on the server and
  written as `data-theme` on `<html>`. `system` is resolved purely in CSS with
  `prefers-color-scheme`, so no script decides the theme and nothing flashes.
- The theme switcher is a `<form>` posting to a Server Action, so it works
  without JavaScript.
- CSP: scripts and `<style>` elements require the nonce;
  `style-src-attr 'unsafe-inline'` permits only `style=""` attributes that
  libraries such as Radix emit for positioning. Attribute styles cannot run
  script, and HTML injection itself is prevented by React escaping plus the
  `react/no-danger` and `innerHTML` lint rules.

## Consequences

- Changing the palette requires a deploy, which matches the decision that
  appearance is developer-managed (PRD §10.3).
- `palettes.test.ts` enforces WCAG 2.2 AA contrast for every palette and
  scheme, so a new palette cannot ship with unreadable pairs.
