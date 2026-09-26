const SENSITIVE_KEY = /password|secret|token|hash|^(new|current|confirm)?pin$/i;

export const REDACTED = "[REDACTED]";

/** Replaces values of sensitive keys at any depth before they reach the audit log (FR-AUD-01). */
export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (typeof value !== "object" || value === null || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : maskSensitive(child),
    ]),
  );
}
