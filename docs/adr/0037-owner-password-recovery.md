# ADR-0037: Owner password change and recovery

- Status: Accepted
- Date: 2026-09-30
- Requirements: PRD FR-AUTH-01/04, FR-AUTH-11..13; BRD BR-01, BR-30, Q-43

## Context

Employees who forget their PIN are reset by the Owner (FR-AUTH-06). The
Owner is the only account above them (BR-01), so nobody in the app could
reset a forgotten Owner password, and the Owner could not even change it
while signed in. Re-running the seed does not help, since it only creates
an Owner when there is none. A single store has no mail service, and
adding one would make an inbox the way into the account.

## Decision

- **Change while signed in.** `/account` ("Akun & keamanan", a key icon on
  the account card, password accounts only) changes the password after the
  current one. A wrong current password counts towards the lockout like a
  failed login. Other devices are signed out.
- **Recovery codes.** The same page creates 8 single-use codes after the
  current password. Each is 16 Crockford base32 characters (80 bits), shown
  as `XXXX-XXXX-XXXX-XXXX`, and read without regard to case, spaces,
  dashes or O/I/L. With that much entropy a SHA-256 digest is enough; only
  digests are stored (`recovery_codes`). The codes are shown once, with copy
  and a `.txt` download. A new set replaces the old one. While no unused
  code is left, every page shows a banner linking to `/account`.
- **Recovery.** The password step of the sign-in links to `/recover`:
  username, code and a new password. Unknown users, PIN accounts and wrong
  codes get the same answer. Wrong codes count towards the account lockout
  and the per-IP limit shared with sign-in (FR-AUTH-04). Success uses up the
  code, lifts the lockout, signs out every device, is audited with the
  codes left, and leads back to sign-in with a notice.
- **Last resort.** `pnpm owner:reset-password`, run by whoever holds the
  database URL, sets a random 24-character temporary password, lifts the
  lockout, signs out every device and prints the password once. It is
  audited as `auth.password.reset` without an actor.
- **Not built.** Reset by e-mail, and a forced change after the temporary
  password.

## Consequences

- An Owner who loses both the password and the codes depends on the
  developer, as before, but now through a documented, audited command.
- Recovery codes are as strong as the password: whoever finds a printed
  code and knows the username can take the account, so they belong
  somewhere private.
