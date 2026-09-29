import { z } from "zod";

import { stockMovementTypes } from "@/db/schema";
import { plainText } from "@/lib/validation/text";

const quantity = z.int().min(1).max(1_000_000);

/** Goods received (FR-STK-01 `IN`); the note is optional. */
export const receiveStockInput = z.object({ qty: quantity, note: plainText(200, 0) }).strict();

/** Stock count: the physically counted quantity; a reason is mandatory (FR-STK-05). */
export const countStockInput = z
  .object({ counted: z.int().min(0).max(1_000_000), reason: plainText(200) })
  .strict();

/** Damaged or lost goods (`WRITE_OFF`); a reason is mandatory. */
export const writeOffStockInput = z.object({ qty: quantity, reason: plainText(200) }).strict();

export type ReceiveStockInput = z.infer<typeof receiveStockInput>;
export type CountStockInput = z.infer<typeof countStockInput>;
export type WriteOffStockInput = z.infer<typeof writeOffStockInput>;

/** Stock list filters from the query string. */
export const stockFilters = z.object({
  q: z.string().trim().max(60).catch(""),
  low: z.enum(["1"]).optional().catch(undefined),
  /** Only defect pieces (FR-ROL-05). */
  defect: z.enum(["1"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
});

/** Movement history filters (FR-STK-06); invalid values are dropped. */
export const movementFilters = z.object({
  type: z.enum(stockMovementTypes).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  cursor: z.uuid().optional().catch(undefined),
  /** Include rows marked archived by housekeeping (FR-HK-04). */
  archived: z.literal("1").optional().catch(undefined),
});

export type StockFilters = z.infer<typeof stockFilters>;
export type MovementFilters = z.infer<typeof movementFilters>;
