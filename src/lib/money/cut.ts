/**
 * Price or cost of one unit of a line: as stored, or for a custom cut the
 * per-meter amount for its length, rounded to whole rupiah (FR-ROL-04).
 * Shared by the POS preview and checkout so both agree.
 */
export function cutPrice(perUnit: number, lengthCm: number | undefined | null): number {
  return lengthCm == null ? perUnit : Math.round((perUnit * lengthCm) / 100);
}
