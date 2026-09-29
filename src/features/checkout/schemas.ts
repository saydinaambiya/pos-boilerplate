import { z } from "zod";

import { kasbonCheckoutInput, saleCustomerInput } from "@/features/kasbon/schemas";
import { MAX_RUPIAH, rupiah } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

const itemDiscount = z.union([
  z.object({ type: z.literal("percent"), bps: z.int().min(1).max(10_000) }).strict(),
  z.object({ type: z.literal("amount"), value: rupiah.min(1) }).strict(),
]);

/**
 * Methods the POS settles directly; a remainder can go on store credit
 * instead (FR-PAY-05). QRIS settles into the store's QRIS account
 * (FR-PAY-07).
 */
export const posPaymentMethods = ["CASH", "TRANSFER", "QRIS"] as const;

/** Bank or e-wallet a QRIS payment came from; required for QRIS (FR-PAY-07). */
export const sourceBank = plainText(40);

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
            /** Custom cut off a roll, in cm per unit (FR-ROL-04); only on roll variants. */
            lengthCm: z.int().min(1).max(100_000).optional(),
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
            sourceBank: sourceBank.optional(),
          })
          .strict()
          .refine((payment) => (payment.method === "QRIS") === (payment.sourceBank !== undefined), {
            path: ["sourceBank"],
            error: "required",
          }),
      )
      .max(4),
    /** Buyer of the sale (FR-POS-11). */
    customer: saleCustomerInput,
    /** One voucher per sale, validated again on the server (FR-POS-03). */
    voucherCode: z.string().trim().max(20).optional(),
    /** Puts the unpaid remainder on store credit for this customer (FR-PAY-05). */
    kasbon: kasbonCheckoutInput.optional(),
  })
  .strict()
  .refine((value) => !value.kasbon || value.customer.phone !== null, {
    path: ["customer", "phone"],
    error: "required",
  });

export type CheckoutInput = z.infer<typeof checkoutInput>;
export type CheckoutPayment = CheckoutInput["payments"][number];
