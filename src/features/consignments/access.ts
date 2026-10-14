import type { Session } from "@/lib/auth/session";

/**
 * Pickup and return staff see every salesperson's goods and sales; a
 * salesperson only sees their own (FR-CSG-01, FR-CSG-10).
 */
export function seesEveryConsignment(session: Session): boolean {
  return (
    session.permissions.has("consignment:pickup") || session.permissions.has("consignment:return")
  );
}
