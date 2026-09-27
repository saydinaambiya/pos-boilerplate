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

/**
 * Formats what the user typed as a grouped rupiah amount while typing:
 * digits only, no leading zeros, at most 12 digits, grouped with `.` in
 * Indonesian and `,` in English ("1500000" → "1.500.000").
 */
export function formatRupiahDigits(input: string, locale: string): string {
  const digits = input
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 12);
  if (digits === "") return "";
  const separator = locale.startsWith("en") ? "," : ".";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** Caret position after the `digitsBefore`-th digit of a formatted amount. */
export function caretAfterDigits(formatted: string, digitsBefore: number): number {
  if (digitsBefore <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted.charAt(index))) seen += 1;
    if (seen === digitsBefore) return index + 1;
  }
  return formatted.length;
}
