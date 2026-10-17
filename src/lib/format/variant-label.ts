import { formatThickness } from "./length";

/** Product name with its brand beside it, e.g. "Fox · Karpet Mihrab" (FR-PRD-08). */
export function brandedName(productName: string, brandName?: string | null): string {
  return brandName ? `${brandName} · ${productName}` : productName;
}

/**
 * Display name of a sellable variant with its brand, e.g.
 * "Fox · Kaos Polos · Merah" (PRD §3.1.1, FR-PRD-08).
 */
export function variantLabel(
  productName: string,
  colorName: string | null,
  brandName?: string | null,
): string {
  const name = brandedName(productName, brandName);
  return colorName ? `${name} · ${colorName}` : name;
}

/**
 * A frozen details line without its leading brand, for rows that already
 * show the brand beside the name (FR-PRD-06, FR-PRD-08).
 */
export function detailsWithoutBrand(details: string | null, brandName?: string | null) {
  if (!details || !brandName) return details;
  if (details === brandName) return null;
  return details.startsWith(`${brandName} · `) ? details.slice(brandName.length + 3) : details;
}

/**
 * Display name of a stock row: its brand when given, colour, then "Roll"
 * or the piece size, e.g. "Fox · Karpet Mihrab · Merah · 93cm x 47cm", with the defect label on a
 * defect piece (ADR-0023, FR-ROL-05).
 */
export function stockItemLabel(
  item: {
    productName: string;
    brandName?: string | null;
    colorName: string | null;
    size: string | null;
    isRoll: boolean;
    isDefect?: boolean;
  },
  defectLabel = "Cacat",
): string {
  const suffix = item.isRoll ? "Roll" : item.size ? formatSizeLabel(item.size) : null;
  return [
    variantLabel(item.productName, item.colorName, item.brandName),
    suffix,
    item.isDefect ? defectLabel : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Name of goods without their colour, for lists that show the colour in
 * its own column, e.g. "Fox · Karpet · 93cm x 47cm · Cacat" (FR-CSG-08,
 * FR-ONL-09, FR-PRD-08).
 */
export function goodsName(
  item: { name: string; brandName?: string | null; size: string | null; isDefect: boolean },
  defectLabel = "Cacat",
): string {
  return [
    brandedName(item.name, item.brandName),
    item.size ? formatSizeLabel(item.size) : null,
    item.isDefect ? defectLabel : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Motif and thickness as labelled parts, e.g. "Motif: Mihrab · Ketebalan: 8mm",
 * for rows whose name already carries the brand, colour and size, so every
 * list shows the same details as the products page (FR-PRD-08).
 */
export function traitsLine(
  item: { motif?: string | null; thickness?: number | null },
  labels: { motif: string; thickness: string },
  locale: string,
): string {
  return [
    item.motif ? `${labels.motif}: ${item.motif}` : null,
    item.thickness ? `${labels.thickness}: ${formatThickness(item.thickness, locale)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** `93x47` as `93cm x 47cm`; kept here so client components need no catalog import. */
function formatSizeLabel(size: string): string {
  const [length, width] = size.split("x");
  return `${length ?? ""}cm x ${width ?? ""}cm`;
}
