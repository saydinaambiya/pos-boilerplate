const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const wallClock = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallClock - instant.getTime();
}

/**
 * UTC instant at which a calendar day starts in the store's time zone
 * (FR-UI-11), e.g. `2026-09-26` in Asia/Jakarta → `2026-09-25T17:00:00Z`.
 * Returns null for anything that is not a real `YYYY-MM-DD` date.
 */
export function startOfZonedDay(isoDate: string, timeZone: string): Date | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const midnightUtc = Date.UTC(year, month - 1, day);
  const check = new Date(midnightUtc);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(midnightUtc - offsetMs(check, timeZone));
}

/** Start of the day after `isoDate`, for inclusive "to" filters. */
export function startOfNextZonedDay(isoDate: string, timeZone: string): Date | null {
  if (!startOfZonedDay(isoDate, timeZone)) return null;
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return startOfZonedDay(next, timeZone);
}
