/** Aging buckets of outstanding store credit (FR-KSB-06). */
export const agingBuckets = ["current", "days31to60", "over60"] as const;
export type AgingBucket = (typeof agingBuckets)[number];

export type DueState = "none" | "upcoming" | "today" | "overdue";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Store-local calendar day as `YYYY-MM-DD` (FR-UI-11). */
export function storeDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** Whole calendar days between two `YYYY-MM-DD` dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** 0–30, 31–60 or more than 60 days since the credit was given, in store days. */
export function agingBucket(ageDays: number): AgingBucket {
  if (ageDays <= 30) return "current";
  if (ageDays <= 60) return "days31to60";
  return "over60";
}

/** Due marker relative to the store's today; settled credit has none. */
export function dueState(dueDate: string | null, today: string, settled: boolean): DueState {
  if (!dueDate || settled) return "none";
  if (dueDate < today) return "overdue";
  return dueDate === today ? "today" : "upcoming";
}
