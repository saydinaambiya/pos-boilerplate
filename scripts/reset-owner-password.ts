/**
 * `pnpm owner:reset-password`: last resort when the Owner lost both the
 * password and the recovery codes (FR-AUTH-13, ADR-0037). Sets a random
 * temporary password, lifts the lockout, signs out every device and prints
 * the password once. Run by whoever holds DATABASE_URL; the Owner then
 * changes it under Pengaturan → Akun & keamanan.
 */
import { db } from "@/db/client";
import { resetOwnerPassword } from "@/features/auth/service";

const result = await resetOwnerPassword({
  ip: null,
  userAgent: "cli: pnpm owner:reset-password",
  requestId: null,
});
await db.$client.end();

if (!result) {
  console.error("No Owner account found. Run `pnpm db:seed` first.");
  process.exit(1);
}
console.warn(
  [
    `Owner password reset for "${result.username}".`,
    `Temporary password: ${result.password}`,
    "Share it privately; the Owner should change it right away under Pengaturan > Akun & keamanan.",
  ].join("\n"),
);
