/** Display name of a sellable variant, e.g. "Kaos Polos · Merah" (PRD §3.1.1). */
export function variantLabel(productName: string, colorName: string | null): string {
  return colorName ? `${productName} · ${colorName}` : productName;
}
