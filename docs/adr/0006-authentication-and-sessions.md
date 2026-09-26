# ADR-0006: Authentication, sessions and authorization

- Status: Accepted
- Date: 2026-09-26
- Requirements: PRD FR-AUTH-01..08, FR-RBAC-01..04, FR-AUD-01..04, NFR-SEC-06/07; BRD BR-01, BR-02, R-03

## Context

PRD §10.1 left the choice between Better Auth and a hand-written session
layer open. Requirements are narrow but specific: owner password and
employee 6-digit PIN, per-account lockout plus a per-IP limit, forced PIN
change, idle timeout, permissions that apply on the next request, and audit
of every attempt. There is no sign-up, OAuth or email flow.

## Decision

- **Own session implementation** instead of Better Auth. The library's value
  (OAuth, email verification, sign-up) is unused here, while PIN login,
  lockout, forced PIN change and dynamic RBAC would all need custom code on
  top of it. Owning ~300 lines keeps behaviour explicit and testable.
- **Credentials**: Argon2id via `@node-rs/argon2` (prebuilt binaries, no
  install script) with the OWASP baseline `m=19 MiB, t=2, p=1`. Owners have
  `password_hash`, employees `pin_hash`; a check constraint enforces exactly
  one. Unknown usernames verify against a dummy hash so timing does not reveal
  which accounts exist.
- **Sessions**: 256-bit random token in an `HttpOnly`, `SameSite=Lax`
  cookie (`Secure` in production); only its SHA-256 is stored in `sessions`.
  The database expiry is authoritative and slides forward on activity (idle
  timeout, default 8 h, written at most every 5 minutes). A PIN change signs
  out the user's other sessions.
- **Brute force** (R-03): after 5 consecutive failures an account locks for
  15 minutes, updated atomically in one `UPDATE`. A per-IP counter
  (20 failures / 15 min) uses Upstash Redis over REST in production and an
  in-memory counter locally; if Upstash is unreachable it fails open because
  the account lockout still applies. Failures show one generic message;
  lockouts are shown explicitly because the user must act on them, which
  reveals that the account exists — acceptable for a single-store staff list.
- **Authorization**: the permission catalog is code (`src/config/permissions.ts`);
  roles and role→permission rows are data. Permissions are resolved from the
  database on every request (`getSession`, cached per request with React
  `cache`), so edits apply without re-login. The Owner role (`is_system`)
  implicitly has every permission. An inactive role grants nothing.
- **Enforcement**: every page calls `requirePermission` / `requireSession`
  (layouts alone are not re-run on client navigation); failures render
  `forbidden()` with HTTP 403 (`experimental.authInterrupts`). Menus are
  filtered with the same permissions. Server Actions rely on Next.js's
  built-in Origin check (NFR-SEC-06) and receive the locale through a hidden
  field because they cannot read `next/root-params`.
- **Audit**: login success/failure/lockout, logout and PIN change are written
  to `audit_logs` in the same transaction as the change; keys that look like
  secrets are masked.

## Consequences

- Security fixes in session handling are ours to make; the surface is small
  and covered by integration tests against real Postgres.
- `forbidden()` depends on an experimental flag; if it changes, only
  `src/lib/auth/guard.ts` and `src/app/[locale]/forbidden.tsx` are affected.
- The idle timeout becomes an owner setting once DB settings land (FR-SET-07).
