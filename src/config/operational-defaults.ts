/**
 * Fallbacks for owner-managed settings (PRD FR-SET-08); values saved in DB
 * settings (`src/lib/settings`) take precedence.
 */
export const operationalDefaults = {
  timeZone: "Asia/Jakarta",
  currency: "IDR",
} as const;
