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

/**
 * Product with its default variant's SKU and minimum stock (FR-PRD-01,
 * §3.1.1). `cost` is omitted when the caller may not see it (FR-PRD-02).
 */
export const productInput = z
  .object({
    name: plainText(120),
    categoryId: z.uuid(),
    price: rupiah,
    cost: rupiah.optional(),
    unit: plainText(16),
    trackStock: z.boolean(),
    sku: skuSchema,
    minStock: z.int().min(0).max(1_000_000),
  })
  .strict();

export const productStatuses = ["active", "inactive", "all"] as const;

/** List filters from the query string; invalid values fall back to defaults. */
export const productFilters = z.object({
  q: z.string().trim().max(60).catch(""),
  category: z.uuid().optional().catch(undefined),
  status: z.enum(productStatuses).catch("active"),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

export type CategoryInput = z.infer<typeof categoryInput>;
export type ProductInput = z.infer<typeof productInput>;
export type ProductFilters = z.infer<typeof productFilters>;
