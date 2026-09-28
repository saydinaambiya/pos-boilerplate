/** Shapes sent to the POS terminal in the browser; no server-only imports. */
export interface PosVariant {
  id: string;
  sku: string;
  colorName: string | null;
  hex: string | null;
  price: number;
  stockQty: number;
}

export interface PosProduct {
  id: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  motif: string | null;
  /** Size code from `PRODUCT_SIZES` (FR-PRD-06). */
  size: string | null;
  unit: string;
  trackStock: boolean;
  hasVariants: boolean;
  variants: PosVariant[];
}
