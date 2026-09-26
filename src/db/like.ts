/**
 * `LIKE` pattern that matches `term` anywhere, case-folded, with `%`, `_` and
 * `\` in the term escaped so user input never acts as a wildcard.
 */
export function containsPattern(term: string): string {
  return `%${term.toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
