/**
 * Parses a decimal typed in either locale ("2,5", "2.5", "40") with at most
 * `decimals` fraction digits. Grouping separators are not accepted: lengths
 * and thicknesses are small numbers (FR-PRD-06, FR-ROL-03).
 */
export function parseDecimal(input: string, decimals = 2): number | null {
  const text = input.trim().replace(",", ".");
  const fraction = decimals > 0 ? `(\\.\\d{1,${String(decimals)}})?` : "";
  if (!new RegExp(`^\\d{1,6}${fraction}$`).test(text)) return null;
  return Number(text);
}

/** Meters typed by the user as whole centimetres, e.g. "1,5" → 150 (ADR-0023). */
export function parseMetersToCm(input: string): number | null {
  const meters = parseDecimal(input, 2);
  return meters === null ? null : Math.round(meters * 100);
}

function decimal(value: number, locale: string, maximumFractionDigits: number): string {
  return new Intl.NumberFormat(locale.startsWith("en") ? "en-US" : "id-ID", {
    maximumFractionDigits,
  }).format(value);
}

/** Roll length in meters, e.g. `38,5m`; units go without a space (FR-ROL-01). */
export function formatMeters(cm: number, locale: string): string {
  return `${decimal(cm / 100, locale, 2)}m`;
}

/** Thickness in millimetres, e.g. `2,5mm` (FR-PRD-06). */
export function formatThickness(mm: number, locale: string): string {
  return `${decimal(mm, locale, 2)}mm`;
}
