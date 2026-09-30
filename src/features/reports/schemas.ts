import { z } from "zod";

/** Longest range a report covers, keeping queries and CSV files bounded (NFR-PERF). */
export const MAX_REPORT_DAYS = 366;

export const reportSections = [
  "daily",
  "expenses",
  "methods",
  "products",
  "variants",
  "brands",
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

/** A recap covers one store day or one month (FR-RPT-06). */
export type RecapPeriod =
  | { kind: "day"; day: string; from: string; to: string; previous: string; next: string | null }
  | {
      kind: "month";
      month: string;
      from: string;
      to: string;
      previous: string;
      next: string | null;
    };

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const addMonths = (month: string, months: number) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
};

/**
 * The recap period from `?day=YYYY-MM-DD` or `?month=YYYY-MM` (FR-RPT-06).
 * Without either it is today; a future day or month falls back to the
 * current one, and a month stops at today. `previous` and `next` step one
 * day or month; `next` is null at the current one.
 */
export function recapPeriod(
  raw: { day?: string | undefined; month?: string | undefined },
  today: string,
): RecapPeriod {
  const thisMonth = today.slice(0, 7);
  if (raw.month !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month)) {
    const month = raw.month > thisMonth ? thisMonth : raw.month;
    const last = addDays(`${addMonths(month, 1)}-01`, -1);
    return {
      kind: "month",
      month,
      from: `${month}-01`,
      to: last > today ? today : last,
      previous: addMonths(month, -1),
      next: month === thisMonth ? null : addMonths(month, 1),
    };
  }
  const parsed = z.iso.date().safeParse(raw.day);
  const day = parsed.success && parsed.data <= today ? parsed.data : today;
  return {
    kind: "day",
    day,
    from: day,
    to: day,
    previous: addDays(day, -1),
    next: day === today ? null : addDays(day, 1),
  };
}
