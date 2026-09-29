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

/** `93x47` as `93cm x 47cm`; kept here so client components need no catalog import. */
function formatSizeLabel(size: string): string {
  const [length, width] = size.split("x");
  return `${length ?? ""}cm x ${width ?? ""}cm`;
}
