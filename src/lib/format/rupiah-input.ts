/** Largest accepted amount: Rp 999.999.999.999 (fits `bigint` and JS numbers exactly). */
export const MAX_RUPIAH = 999_999_999_999;

/**
 * Parses a rupiah amount typed in either locale ("Rp 15.000", "15,000",
 * "15000") into an integer (PRD §5). Rupiah has no minor unit, so dots,
 * commas and spaces are treated as grouping only. Dependency-free so the
 * POS terminal can use it without shipping a validation library.
 */
export function parseRupiah(input: string): number | null {
  const digits = input.replace(/^\s*Rp\.?/i, "").replace(/[\s.,]/g, "");
  if (!/^\d{1,12}$/.test(digits)) return null;
  return Number(digits);
}
