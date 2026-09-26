import { z } from "zod";

import {
  complaintResolutions,
  onlineOrderStatuses,
  returnConditions,
} from "@/db/schema/online-orders";
import { rupiah } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

/** A manually entered marketplace order (FR-ONL-01); prices come from the catalogue. */
export const createOnlineOrderInput = z
  .object({
    marketplaceId: z.uuid(),
    orderCode: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9._/-]+$/)
      .transform((value) => value.toUpperCase()),
    lines: z
      .array(z.object({ variantId: z.uuid(), qty: z.int().min(1).max(9999) }).strict())
      .min(1)
      .max(100),
    shippingFee: rupiah,
    note: plainText(300, 0),
  })
  .strict();
export type CreateOnlineOrderInput = z.infer<typeof createOnlineOrderInput>;

/**
 * A status change (FR-ONL-03). `from` is the status the user saw, so a
 * change based on stale data is refused.
 */
export const changeStatusInput = z
  .object({
    from: z.enum(onlineOrderStatuses),
    to: z.enum(onlineOrderStatuses),
    note: plainText(300, 0),
    complaintNote: plainText(300, 0),
    resolution: z.enum(complaintResolutions).nullable(),
    returns: z.array(z.object({ itemId: z.uuid(), condition: z.enum(returnConditions) }).strict()),
  })
  .strict();
export type ChangeStatusInput = z.infer<typeof changeStatusInput>;

/** Query string of the online order board (FR-ONL-04). */
export const onlineOrderListQuery = z.object({
  status: z.enum(onlineOrderStatuses).optional().catch(undefined),
  q: z.string().trim().max(40).catch(""),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  /** Include orders marked archived by housekeeping (FR-HK-04). */
  archived: z.literal("1").optional().catch(undefined),
});
