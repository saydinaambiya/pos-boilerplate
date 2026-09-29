/** Shapes sent to the POS terminal in the browser; no server-only imports. */
export interface PosVariant {
  id: string;
  sku: string;
  colorName: string | null;
  hex: string | null;
  /** Per piece, or on a roll per meter for custom cuts (FR-ROL-04). */
  price: number;
  /** Pieces, or on a roll centimetres (ADR-0023). */
  stockQty: number;
  /** The roll a piece is cut from; null on rolls and plain variants. */
  parentId: string | null;
  /** Piece size code from `PRODUCT_SIZES`. */
  size: string | null;
  /** A defect piece, priced apart (FR-ROL-05). */
  isDefect: boolean;
}

export interface PosProduct {
  id: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  motif: string | null;
  /** Thickness in mm (FR-PRD-06). */
  thickness: number | null;
  /** Sold as pieces cut from each colour's roll, or cut to length (FR-ROL-01). */
  isRoll: boolean;
  unit: string;
  trackStock: boolean;
  hasVariants: boolean;
  variants: PosVariant[];
}
