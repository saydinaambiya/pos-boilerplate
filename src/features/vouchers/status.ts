export type DisplayStatus =
  "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE" | "REJECTED" | "EXPIRED" | "SCHEDULED";

/** Expiry is evaluated on read, no scheduler needed (PRD §4.4). */
export function displayStatusFor(
  status: DisplayStatus,
  terms: { startsAt: Date | null; endsAt: Date | null } | null,
  now = new Date(),
): DisplayStatus {
  if (status !== "ACTIVE" || !terms) return status;
  if (terms.endsAt && terms.endsAt <= now) return "EXPIRED";
  if (terms.startsAt && terms.startsAt > now) return "SCHEDULED";
  return "ACTIVE";
}
