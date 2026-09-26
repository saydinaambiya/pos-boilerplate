import { z } from "zod";

import { MAX_RUPIAH, rupiah } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

const itemDiscount = z.union([
  z.object({ type: z.literal("percent"), bps: z.int().min(1).max(10_000) }).strict(),
  z.object({ type: z.literal("amount"), value: rupiah.min(1) }).strict(),
]);

/** Methods the POS can settle directly; KASBON and MARKETPLACE arrive with M3/M4. */
export const posPaymentMethods = ["CASH", "TRANSFER"] as const;

/**
 * Checkout request (FR-POS-01..08, FR-PAY-01..04). Prices and totals are
 * never accepted from the client: the server looks them up and recomputes
 * (PRD §5). Cash tendered is not sent at all, only the amount allocated to
 * the bill (BR-22).
 */
export const checkoutInput = z
  .object({
    idempotencyKey: z.uuid(),
    lines: z
      .array(
        z
          .object({
            variantId: z.uuid(),
            qty: z.int().min(1).max(9999),
            discount: itemDiscount.nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    payments: z
      .array(
        z
          .object({
            method: z.enum(posPaymentMethods),
            amount: z.int().min(1).max(MAX_RUPIAH),
            bankAccountId: z.uuid().optional(),
            reference: plainText(60, 0).optional(),
          })
          .strict(),
      )
      .max(4),
    /** One voucher per sale, validated again on the server (FR-POS-03). */
    voucherCode: z.string().trim().max(20).optional(),
  })
  .strict();

export type CheckoutInput = z.infer<typeof checkoutInput>;
export type CheckoutPayment = CheckoutInput["payments"][number];
