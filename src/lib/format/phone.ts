/**
 * Normalises an Indonesian mobile number to `+628…` (FR-KSB-01). Accepts
 * `08…`, `628…` and `+628…` with spaces, dots or dashes; the subscriber
 * part after `8` has 7–11 digits. Returns null when it is not one.
 */
export function normalizeIndonesianPhone(value: string): string | null {
  const compact = value.replace(/[\s.()-]/g, "");
  const match = /^(?:\+62|62|0)(8\d{7,11})$/.exec(compact);
  return match ? `+62${match[1] ?? ""}` : null;
}

/** `+628123456789` → `0812-3456-789` for display. */
export function formatIndonesianPhone(normalized: string): string {
  const local = `0${normalized.replace(/^\+62/, "")}`;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}
