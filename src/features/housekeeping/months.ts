/** `YYYY-MM` of a store-local `YYYY-MM-DD` date. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Month `offset` months after (or before, if negative) `month`. */
export function addMonths(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Latest month old enough to archive: it must have ended at least
 * `retentionMonths` months ago (FR-HK-01), e.g. September with 3 months →
 * June.
 */
export function latestArchivableMonth(today: string, retentionMonths: number): string {
  return addMonths(monthOf(today), -retentionMonths);
}

export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Archivable months from `latest` back to `earliest`, newest first, at most `limit`. */
export function archivableMonths(earliest: string | null, latest: string, limit: number): string[] {
  if (!earliest || earliest > latest) return [];
  const months: string[] = [];
  for (
    let month = latest;
    month >= earliest && months.length < limit;
    month = addMonths(month, -1)
  ) {
    months.push(month);
  }
  return months;
}
