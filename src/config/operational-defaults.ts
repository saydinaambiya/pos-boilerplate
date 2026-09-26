/**
 * Fallbacks for owner-managed settings (PRD FR-SET-08). From Milestone 1 the
 * values stored in DB settings take precedence over these.
 */
export const operationalDefaults = {
  timeZone: "Asia/Jakarta",
  currency: "IDR",
} as const;
