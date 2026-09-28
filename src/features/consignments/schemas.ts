import { z } from "zod";

import { kasbonCheckoutInput, saleCustomerInput } from "@/features/kasbon/schemas";
import { plainText } from "@/lib/validation/text";

const quantity = z.int().min(0).max(9999);

/** Goods a salesperson takes out in one visit (FR-CSG-02). */
export const takeGoodsInput = z
  .object({
    idempotencyKey: z.uuid(),
    salespersonId: z.uuid(),
    lines: z
      .array(z.object({ variantId: z.uuid(), qty: quantity.min(1) }).strict())
      .min(1)
      .max(100),
    note: plainText(200, 0),
  })
  .strict();
export type TakeGoodsInput = z.infer<typeof takeGoodsInput>;

export const settlementMethods = ["CASH", "TRANSFER", "KASBON"] as const;

/** How the sold part is paid: in full by cash or transfer, or on store credit (FR-CSG-04). */
const settlementPayment = z.discriminatedUnion("method", [
  z.object({ method: z.literal("CASH") }).strict(),
  z
    .object({
      method: z.literal("TRANSFER"),
      bankAccountId: z.uuid(),
      reference: plainText(60, 0),
    })
    .strict(),
  z
    .object({ method: z.literal("KASBON") })
    .extend(kasbonCheckoutInput.shape)
    .strict(),
]);
export type SettlementPayment = z.infer<typeof settlementPayment>;

/**
 * A settlement (FR-CSG-03/04): per variant how many were sold and how many
 * come back; what is left stays with the salesperson. Sold goods become a
 * sale for the named buyer (FR-POS-11); store credit needs the phone
 * (BR-11).
 */
export const settleGoodsInput = z
  .object({
    idempotencyKey: z.uuid(),
    lines: z
      .array(
        z
          .object({ variantId: z.uuid(), sold: quantity, returned: quantity })
          .strict()
          .refine((line) => line.sold + line.returned > 0, { error: "required" }),
      )
      .min(1)
      .max(100),
    /** Required once anything is sold; a returns-only settlement has no buyer. */
    customer: saleCustomerInput.nullable(),
    payment: settlementPayment,
    note: plainText(200, 0),
  })
  .strict()
  .refine((value) => value.lines.every((line) => line.sold === 0) || value.customer !== null, {
    path: ["customer"],
    error: "required",
  })
  .refine(
    (value) =>
      value.payment.method !== "KASBON" ||
      value.lines.every((line) => line.sold === 0) ||
      value.customer?.phone != null,
    { path: ["customer", "phone"], error: "required" },
  );
export type SettleGoodsInput = z.infer<typeof settleGoodsInput>;

export const consignmentFilters = ["open", "closed"] as const;
