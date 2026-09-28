/**
 * Product sizes, length × width in cm (FR-PRD-06). The list is fixed in
 * code; a new size ships with a release (ADR-0021).
 */
export const PRODUCT_SIZES = ["93x47", "100x70", "50x140", "100x140"] as const;

export type ProductSize = (typeof PRODUCT_SIZES)[number];

/** Human form of a size code, e.g. `93 × 47 cm`. */
export function formatSize(size: string): string {
  const [length, width] = size.split("x");
  return `${length ?? ""} × ${width ?? ""} cm`;
}

/** Brand, motif and size on one line, e.g. `Turkiye · Mihrab · 93 × 47 cm` (FR-PRD-06). */
export function productDetailsLine(product: {
  brandName: string | null;
  motif: string | null;
  size: string | null;
}): string {
  return [product.brandName, product.motif, product.size ? formatSize(product.size) : null]
    .filter(Boolean)
    .join(" · ");
}
