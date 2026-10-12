/**
 * Price or cost of one unit of a line: as stored, or for a custom cut the
 * per-meter amount for its length, rounded to whole rupiah (FR-ROL-04).
 * Shared by the POS preview and checkout so both agree.
 */
export function cutPrice(perUnit: number, lengthCm: number | undefined | null): number {
  return lengthCm == null ? perUnit : Math.round((perUnit * lengthCm) / 100);
}

/**
 * Price or cost of a weighed line: the per-kg amount for its weight in
 * grams, rounded to whole rupiah (ADR-0045).
 */
export function weighPrice(perKg: number, weightG: number | undefined | null): number {
  return weightG == null ? perKg : Math.round((perKg * weightG) / 1000);
}
