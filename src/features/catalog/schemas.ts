import { z } from "zod";

import { rupiah } from "@/lib/validation/money";
import { nameText, plainText } from "@/lib/validation/text";

import { canonicalColor, canonicalMotif } from "./options";
import { defectWord, formatSize, PRODUCT_SIZES } from "./sizes";

/** Brand name (FR-CAT-02). */
export const brandInput = z.object({ name: plainText(40) }).strict();

/** SKUs double as barcodes later (PRD §13), so they stay short and URL-safe. */
export const skuSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{1,40}$/);

const minStock = z.int().min(0).max(1_000_000);

/** Motif from the list or typed under "Other"; a typed listed motif takes the listed spelling (FR-PRD-06, ADR-0034). */
export const motifName = nameText(60).transform(canonicalMotif);

/** Colour from the list or typed under "Other"; a typed listed colour takes the listed spelling (FR-VAR-01, ADR-0034). */
export const colorName = nameText(40).transform(canonicalColor);

/** A choice from a list; an empty submission reads as "required", not "invalid". */
const chosen = <T extends z.ZodType<string, string>>(schema: T) => z.string().min(1).pipe(schema);

/** Empty submissions become `null` for older products without these details (FR-PRD-06). */
const optionalChoice = <T extends z.ZodType<string, string>>(schema: T) =>
  z
    .string()
    .transform((value) => (value === "" ? null : value))
    .pipe(schema.nullable());

export const productSize = z.enum(PRODUCT_SIZES);

/** Thickness in mm, up to two decimals (FR-PRD-06). */
const thickness = z
  .number()
  .positive()
  .max(1000)
  .refine((value) => Math.round(value * 100) === value * 100);

/** Piece price of every size on a roll product, the same for all colours (FR-ROL-02). */
export const sizePrices = z
  .object(
    Object.fromEntries(PRODUCT_SIZES.map((size) => [size, rupiah])) as Record<
      (typeof PRODUCT_SIZES)[number],
      typeof rupiah
    >,
  )
  .strict();
export type SizePrices = z.infer<typeof sizePrices>;

/**
 * Product-level fields (FR-PRD-01, FR-PRD-06). `cost` is omitted when the
 * caller may not see it (FR-PRD-02). Brand, motif and thickness may stay
 * empty on products created before they existed; omitted means unchanged.
 * On a roll product `price` and `cost` are per meter and `sizePrices` is
 * required (FR-ROL-02).
 */
export const productDetailsInput = z
  .object({
    name: plainText(120),
    brandId: optionalChoice(z.uuid()).optional(),
    motif: optionalChoice(motifName).optional(),
    thickness: thickness.nullable().optional(),
    sizePrices: sizePrices.optional(),
    defectSizePrices: sizePrices.optional(),
    price: rupiah,
    unit: plainText(16),
    trackStock: z.boolean(),
  })
  .strict();

/**
 * Product plus its default variant's SKU and minimum stock (§3.1.1). Once
 * colour variants are enabled, those live on each variant instead.
 */
export const productInput = productDetailsInput.extend({ sku: skuSchema, minStock });

/** A roll SKU leaves room for each piece's size suffix, e.g. `KRP-01-100x140` (ADR-0023). */
export const rollSkuSchema = skuSchema.pipe(z.string().max(32));

/** Roll product with its default roll's SKU and minimum stock in cm (FR-ROL-01/02). */
export const rollProductInput = productInput.extend({
  sku: rollSkuSchema,
  sizePrices,
  defectSizePrices: sizePrices,
});

/**
 * New products are rolls (FR-ROL-01) and must name their first colour,
 * brand, motif and thickness (FR-PRD-06, ADR-0026, ADR-0034).
 */
export const newProductInput = rollProductInput.extend({
  /** The first colour; its roll becomes the default variant (FR-VAR-01, ADR-0026). */
  colorName: chosen(colorName),
  brandId: chosen(z.uuid()),
  motif: chosen(motifName),
  thickness: thickness.nullable().refine((value) => value !== null, { error: "required" }),
});

/** Swatch colour, validated strictly because it is rendered as SVG `fill` (FR-VAR-03). */
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Shape of `product_variants.attributes` (PRD §11). */
export const variantAttributes = z
  .object({
    color: z.object({ name: plainText(40), hex: hexColor.optional() }).strict(),
  })
  .strict();

export type VariantColor = z.infer<typeof variantAttributes>["color"];

/** Reads the colour of a variant; the hidden default variant has none. */
export function colorOf(attributes: unknown): VariantColor | null {
  const parsed = variantAttributes.safeParse(attributes);
  return parsed.success ? parsed.data.color : null;
}

/**
 * Frozen variant name on consignment and order lines: the colour and, for
 * a piece cut from a roll, its size and defect flag, e.g.
 * `Red · 93cm x 47cm · Cacat` (ADR-0023, FR-ROL-05).
 */
export function variantSnapshotOf(
  attributes: unknown,
  size: string | null,
  isDefect = false,
): string | null {
  return (
    [colorOf(attributes)?.name, size ? formatSize(size) : null, isDefect ? defectWord() : null]
      .filter(Boolean)
      .join(" · ") || null
  );
}

const colorFields = {
  colorName: chosen(colorName),
  hex: z.union([z.literal(""), hexColor]),
};

/** First colour variant when enabling variants; it takes over the stock (FR-VAR-06). */
export const enableVariantsInput = z.object({ ...colorFields, sku: skuSchema, minStock }).strict();

/** Editable colour variant; overrides fall back to the product (FR-VAR-02). */
export const variantInput = z
  .object({
    ...colorFields,
    sku: skuSchema,
    minStock,
    priceOverride: rupiah.nullable(),
  })
  .strict();

/** New colour variant with optional opening stock (FR-VAR-01). */
export const newVariantInput = variantInput.extend({ initialStock: z.int().min(0).max(1_000_000) });

export const productStatuses = ["active", "inactive", "all"] as const;

/** List filters from the query string; invalid values fall back to defaults. */
export const productFilters = z.object({
  q: z.string().trim().max(60).catch(""),
  brand: z.uuid().optional().catch(undefined),
  status: z.enum(productStatuses).catch("active"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export type ProductDetailsInput = z.infer<typeof productDetailsInput>;
export type ProductInput = z.infer<typeof productInput>;
export type NewProductInput = z.infer<typeof newProductInput>;
export type BrandInput = z.infer<typeof brandInput>;
export type EnableVariantsInput = z.infer<typeof enableVariantsInput>;
export type VariantInput = z.infer<typeof variantInput>;
export type NewVariantInput = z.infer<typeof newVariantInput>;
export type ProductFilters = z.infer<typeof productFilters>;
