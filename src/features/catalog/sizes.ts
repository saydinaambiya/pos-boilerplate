import { formatThickness } from "@/lib/format/length";

/**
 * Piece sizes, length × width in cm (FR-PRD-06). The list is fixed in
 * code; a new size ships with a release (ADR-0021).
 */
export const PRODUCT_SIZES = ["93x47", "100x70", "50x140", "100x140"] as const;

export type ProductSize = (typeof PRODUCT_SIZES)[number];

export function isProductSize(value: string | null | undefined): value is ProductSize {
  return (PRODUCT_SIZES as readonly (string | null | undefined)[]).includes(value);
}

/** Every roll is 140 cm wide (FR-ROL-03, ADR-0023). */
export const ROLL_WIDTH_CM = 140;

/**
 * Roll length one piece of each size uses, laid out across the 140 cm
 * width: 100×70 fits twice side by side, 93×47 once (FR-ROL-03).
 */
export const ROLL_USAGE_CM: Readonly<Record<ProductSize, number>> = {
  "93x47": 47,
  "100x70": 50,
  "50x140": 50,
  "100x140": 100,
};

/** Human form of a size code, e.g. `93cm x 47cm`: units written without a space. */
export function formatSize(size: string): string {
  const [length, width] = size.split("x");
  return `${length ?? ""}cm x ${width ?? ""}cm`;
}

/** Word marking a defect piece in frozen snapshots (FR-ROL-05). */
export function defectWord(locale = "id"): string {
  return locale.startsWith("en") ? "Defect" : "Cacat";
}

/**
 * Brand, motif, thickness and size on one line, e.g.
 * `Turkiye · Mihrab · 8mm · 93cm x 47cm · Cacat` (FR-PRD-06, FR-ROL-05).
 * Frozen into sale lines, so the default locale is used unless one is given.
 */
export function productDetailsLine(
  product: {
    brandName: string | null;
    motif: string | null;
    thickness?: number | null;
    size?: string | null;
    isDefect?: boolean;
  },
  locale = "id",
): string {
  return [
    product.brandName,
    product.motif,
    product.thickness ? formatThickness(product.thickness, locale) : null,
    product.size ? formatSize(product.size) : null,
    product.isDefect ? defectWord(locale) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
