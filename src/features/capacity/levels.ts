export type CapacityLevel = "ok" | "info" | "warning" | "critical";

/** Warning level for a share of the quota in use (FR-CAP-03). */
export function capacityLevel(percent: number): CapacityLevel {
  if (percent >= 95) return "critical";
  if (percent >= 85) return "warning";
  if (percent >= 70) return "info";
  return "ok";
}

/** Share of the quota in use, one decimal, never negative. */
export function usedPercent(usedBytes: number, limitBytes: number): number {
  if (limitBytes <= 0) return 0;
  return Math.max(0, Math.round((usedBytes / limitBytes) * 1000) / 10);
}
