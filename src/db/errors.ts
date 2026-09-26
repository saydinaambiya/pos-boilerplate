interface PostgresErrorFields {
  code?: unknown;
  constraint_name?: unknown;
}

/** Walks Drizzle's wrapped errors to the postgres.js error that carries SQLSTATE fields. */
function postgresError(error: unknown): PostgresErrorFields | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current instanceof Error; depth += 1) {
    const fields = current as Error & PostgresErrorFields;
    if (typeof fields.code === "string") return fields;
    current = current.cause;
  }
  return null;
}

/** Postgres `unique_violation`, possibly wrapped by Drizzle's query error. */
export function isUniqueViolation(error: unknown): boolean {
  return postgresError(error)?.code === "23505";
}

/** Name of the violated unique index, to tell e.g. SKU and colour clashes apart. */
export function uniqueViolationConstraint(error: unknown): string | null {
  const fields = postgresError(error);
  return fields?.code === "23505" && typeof fields.constraint_name === "string"
    ? fields.constraint_name
    : null;
}
