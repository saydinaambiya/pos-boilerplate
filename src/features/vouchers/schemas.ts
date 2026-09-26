import { z } from "zod";

import { voucherTypes } from "@/db/schema";
import { MAX_RUPIAH, rupiah } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

/** Codes are unique and upper-case (FR-VCH-01). */
export const voucherCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,20}$/);

/**
 * Voucher terms (FR-VCH-01, FR-VCH-05). `value` is a whole percentage for
 * `PERCENT` (1–100) and rupiah for `FIXED`; the maximum discount only applies
 * to percentages. Dates are store-local calendar days, both inclusive.
 */
export const voucherTermsInput = z
  .object({
    name: plainText(60),
    type: z.enum(voucherTypes),
    value: z.int().min(1).max(MAX_RUPIAH),
    minPurchase: rupiah.nullable(),
    maxDiscount: rupiah.min(1).nullable(),
    startDate: z.iso.date().nullable(),
    endDate: z.iso.date().nullable(),
    quota: z.int().min(1).max(1_000_000).nullable(),
  })
  .strict()
  .superRefine((terms, context) => {
    if (terms.type === "PERCENT" && terms.value > 100) {
      context.addIssue({
        code: "too_big",
        origin: "number",
        maximum: 100,
        inclusive: true,
        path: ["value"],
        input: terms.value,
      });
    }
    if (terms.type === "FIXED" && terms.maxDiscount !== null) {
      context.addIssue({
        code: "custom",
        path: ["maxDiscount"],
        message: "invalid",
        input: terms.maxDiscount,
      });
    }
    if (terms.startDate && terms.endDate && terms.startDate > terms.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "invalid",
        input: terms.endDate,
      });
    }
  });

export const createVoucherInput = voucherTermsInput.safeExtend({ code: voucherCode });

export type VoucherTermsInput = z.infer<typeof voucherTermsInput>;
export type CreateVoucherInput = z.infer<typeof createVoucherInput>;

/** What a request snapshot contains, for the approval inbox and apply step. */
export const voucherApprovalPayload = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    revisionId: z.uuid(),
    code: z.string(),
    name: z.string(),
    type: z.enum(voucherTypes),
    value: z.number(),
  }),
  z.object({
    kind: z.literal("revise"),
    revisionId: z.uuid(),
    code: z.string(),
    name: z.string(),
    type: z.enum(voucherTypes),
    value: z.number(),
  }),
  z.object({ kind: z.literal("reactivate"), code: z.string() }),
]);

export type VoucherApprovalPayload = z.infer<typeof voucherApprovalPayload>;
