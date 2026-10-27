/**
 * Children fallback for the signed-in shell. The `@modal` slot's catch-all
 * makes strict route matching require a page or default for every sibling
 * slot at this level; the `[...segments]` page still renders every real URL
 * (ADR-0030).
 */
export default function AppDefault() {
  return null;
}
