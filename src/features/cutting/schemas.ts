import { z } from "zod";

import { productSize } from "@/features/catalog/schemas";

/**
 * One cut (FR-ROL-03): the roll length cut off, in cm as typed by the
 * user, and the pieces it yielded per size; at least one piece. A defect
 * cut books every piece as defect (FR-ROL-05).
 */
export const cutRollInput = z
  .object({
    idempotencyKey: z.uuid(),
    lengthCm: z.int().min(1).max(100_000),
    /** Every piece of this cut is a defect piece (FR-ROL-05). */
    defect: z.boolean(),
    pieces: z
      .array(z.object({ size: productSize, qty: z.int().min(1).max(9999) }).strict())
      .min(1)
      .max(4)
      .refine((pieces) => new Set(pieces.map((piece) => piece.size)).size === pieces.length),
  })
  .strict();
export type CutRollInput = z.infer<typeof cutRollInput>;

/** Roll list search and page from the query string (ADR-0041). */
export const rollFilters = z.object({
  q: z.string().trim().max(60).catch(""),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});
export type RollFilters = z.infer<typeof rollFilters>;
