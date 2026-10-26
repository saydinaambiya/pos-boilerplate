const DAY_MS = 24 * 60 * 60 * 1000;

/** How a due date compares with the store's today, for due markers. */
export type DueState = "none" | "upcoming" | "today" | "overdue";

/** Whole calendar days between two `YYYY-MM-DD` dates. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Due marker relative to the store's today (FR-UI-11); settled items have none. */
export function dueState(dueDate: string | null, today: string, settled: boolean): DueState {
  if (!dueDate || settled) return "none";
  if (dueDate < today) return "overdue";
  return dueDate === today ? "today" : "upcoming";
}
