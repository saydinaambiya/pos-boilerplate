import type { shiftKinds } from "@/db/schema";
import type { Session } from "@/lib/auth/session";

export type ShiftKind = (typeof shiftKinds)[number];

/**
 * A cashier works in the store's shared drawer shift; a salesperson
 * without the cashier keeps a shift of their own for the money their
 * goods bring in (ADR-0029, ADR-0032, ADR-0044).
 */
export function shiftKindFor(session: Pick<Session, "permissions">): ShiftKind {
  return session.permissions.has("page:pos") ? "DRAWER" : "SALES";
}
