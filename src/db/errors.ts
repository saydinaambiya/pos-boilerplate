/** Postgres `unique_violation`, possibly wrapped by Drizzle's query error. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth += 1) {
    if ((current as Error & { code?: unknown }).code === "23505") return true;
    current = current.cause;
  }
  return false;
}
