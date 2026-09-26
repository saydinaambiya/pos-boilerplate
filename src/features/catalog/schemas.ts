import { z } from "zod";

import { rupiah } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

/** Category name and display order (FR-CAT-01). */
export const categoryInput = z
  .object({
    name: plainText(40),
    sortOrder: z.int().min(0).max(9999),
  })
  .strict();

/** SKUs double as barcodes later (PRD §13), so they stay short and URL-safe. */
export const skuSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{1,40}$/);

const minStock = z.int().min(0).max(1_000_000);

/**
 * Product-level fields (FR-PRD-01). `cost` is omitted when the caller may
 * not see it (FR-PRD-02).
 */
export const productDetailsInput = z
  .object({
    name: plainText(120),
    categoryId: z.uuid(),
    price: rupiah,
    cost: rupiah.optional(),
    unit: plainText(16),
    trackStock: z.boolean(),
  })
  .strict();

/**
 * Product plus its default variant's SKU and minimum stock (§3.1.1). Once
 * colour variants are enabled, those live on each variant instead.
 */
export const productInput = productDetailsInput.extend({ sku: skuSchema, minStock });

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

const colorFields = {
  colorName: plainText(40),
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
    costOverride: rupiah.nullable().optional(),
  })
  .strict();

/** New colour variant with optional opening stock (FR-VAR-01). */
export const newVariantInput = variantInput.extend({ initialStock: z.int().min(0).max(1_000_000) });

export const productStatuses = ["active", "inactive", "all"] as const;

/** List filters from the query string; invalid values fall back to defaults. */
export const productFilters = z.object({
  q: z.string().trim().max(60).catch(""),
  category: z.uuid().optional().catch(undefined),
  status: z.enum(productStatuses).catch("active"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export type CategoryInput = z.infer<typeof categoryInput>;
export type ProductDetailsInput = z.infer<typeof productDetailsInput>;
export type ProductInput = z.infer<typeof productInput>;
export type EnableVariantsInput = z.infer<typeof enableVariantsInput>;
export type VariantInput = z.infer<typeof variantInput>;
export type NewVariantInput = z.infer<typeof newVariantInput>;
export type ProductFilters = z.infer<typeof productFilters>;
