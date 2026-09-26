/**
 * Percentages are stored as integer basis points (11 % = 1100) so tax math
 * never touches binary floats (PRD §5, FR-SET-04).
 */
const PERCENT = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

export function percentToBasisPoints(input: string): number | null {
  const match = PERCENT.exec(input.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const bps = whole * 100 + fraction;
  return bps <= 10_000 ? bps : null;
}

/** Plain decimal string for form inputs, e.g. 1150 → "11.5". */
export function basisPointsToPercent(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}
