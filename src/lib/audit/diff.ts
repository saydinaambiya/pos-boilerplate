/** Fields whose value differs, as `{ field: { from, to } }` for audit diffs (FR-AUD-01). */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  return Object.fromEntries(
    Object.keys(after)
      .filter((key) => before[key] !== after[key])
      .map((key) => [key, { from: before[key], to: after[key] }]),
  );
}
