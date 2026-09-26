import { z } from "zod";

/** Longest range a report covers, keeping queries and CSV files bounded (NFR-PERF). */
export const MAX_REPORT_DAYS = 366;

export const reportSections = [
  "daily",
  "methods",
  "products",
  "variants",
  "categories",
  "employees",
  "vouchers",
  "tax",
] as const;
export type ReportSection = (typeof reportSections)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Date range of a report in store days, both ends inclusive (FR-RPT-01).
 * Invalid dates fall back to the current month up to `today`; reversed ends
 * are swapped; ranges longer than `MAX_REPORT_DAYS` keep the last days.
 */
export function reportRange(
  raw: { from?: string | undefined; to?: string | undefined },
  today: string,
): { from: string; to: string; clipped: boolean } {
  const date = z.iso.date();
  const a = date.safeParse(raw.from).success && raw.from ? raw.from : `${today.slice(0, 8)}01`;
  const b = date.safeParse(raw.to).success && raw.to ? raw.to : today;
  const [from, to] = a <= b ? [a, b] : [b, a];
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  if (days <= MAX_REPORT_DAYS) return { from, to, clipped: false };
  const start = new Date(Date.parse(to) - (MAX_REPORT_DAYS - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { from: start, to, clipped: true };
}
