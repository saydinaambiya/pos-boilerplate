/** Display name of a sellable variant, e.g. "Kaos Polos · Merah" (PRD §3.1.1). */
export function variantLabel(productName: string, colorName: string | null): string {
  return colorName ? `${productName} · ${colorName}` : productName;
}

/**
 * Display name of a stock row: its colour, then "Roll" or the piece size,
 * e.g. "Karpet Mihrab · Merah · 93cm x 47cm", with the defect label on a
 * defect piece (ADR-0023, FR-ROL-05).
 */
export function stockItemLabel(
  item: {
    productName: string;
    colorName: string | null;
    size: string | null;
    isRoll: boolean;
    isDefect?: boolean;
  },
  defectLabel = "Cacat",
): string {
  const suffix = item.isRoll ? "Roll" : item.size ? formatSizeLabel(item.size) : null;
  return [
    variantLabel(item.productName, item.colorName),
    suffix,
    item.isDefect ? defectLabel : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Name of goods without their colour, for lists that show the colour in
 * its own column, e.g. "Karpet · 93cm x 47cm · Cacat" (FR-CSG-08, FR-ONL-09).
 */
export function goodsName(
  item: { name: string; size: string | null; isDefect: boolean },
  defectLabel = "Cacat",
): string {
  return [
    item.name,
    item.size ? formatSizeLabel(item.size) : null,
    item.isDefect ? defectLabel : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** `93x47` as `93cm x 47cm`; kept here so client components need no catalog import. */
function formatSizeLabel(size: string): string {
  const [length, width] = size.split("x");
  return `${length ?? ""}cm x ${width ?? ""}cm`;
}
