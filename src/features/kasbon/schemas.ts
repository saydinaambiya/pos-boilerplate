import { z } from "zod";

import { optionalIndonesianPhone } from "@/lib/validation/phone";
import { MAX_RUPIAH } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

const isoDate = z.iso.date();

/**
 * Customer on a store credit; the phone, when given, is the re-selection
 * key (FR-KSB-01, BR-11, ADR-0047).
 */
export const customerInput = z
  .object({
    name: plainText(80),
    phone: optionalIndonesianPhone,
    note: plainText(200, 0),
  })
  .strict();
export type CustomerInput = z.infer<typeof customerInput>;

/**
 * Buyer named on every sale (FR-POS-11): the name is required, the phone
 * optional, also on store credit (BR-11, ADR-0047).
 */
export const saleCustomerInput = z
  .object({
    name: plainText(80),
    phone: optionalIndonesianPhone,
  })
  .strict();
export type SaleCustomerInput = z.infer<typeof saleCustomerInput>;

/**
 * Puts the unpaid remainder of a sale on store credit (FR-PAY-05, BR-11).
 * The customer is the sale's buyer; only the note and terms are added here.
 */
export const kasbonCheckoutInput = z
  .object({
    note: plainText(200, 0),
    dueDate: isoDate.nullable(),
  })
  .strict();
export type KasbonCheckoutInput = z.infer<typeof kasbonCheckoutInput>;

/**
 * An older store credit entered by hand, e.g. from the paper book
 * (FR-KSB-08, ADR-0052). `amount` is what is still owed; `openedOn` is the
 * store date it was given and drives its age.
 */
export const manualKasbonInput = z
  .object({
    name: plainText(80),
    phone: optionalIndonesianPhone,
    openedOn: isoDate,
    amount: z.int().min(1).max(MAX_RUPIAH),
    reference: plainText(40, 0),
    description: plainText(200, 0),
    dueDate: isoDate.nullable(),
  })
  .strict();
export type ManualKasbonInput = z.infer<typeof manualKasbonInput>;

export const kasbonPaymentMethods = ["CASH", "TRANSFER"] as const;

/**
 * An installment or payoff waiting for approval (FR-KSB-03): cash,
 * transfer, or both, like a POS payment. Cash tendered is not sent, only the
 * amount applied to the credit (BR-22).
 */
export const kasbonPaymentInput = z
  .object({
    cash: z.int().min(0).max(MAX_RUPIAH),
    transfer: z
      .object({
        amount: z.int().min(1).max(MAX_RUPIAH),
        bankAccountId: z.uuid(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((value) => value.cash + (value.transfer?.amount ?? 0) > 0, {
    path: ["cash"],
    error: "required",
  });
export type KasbonPaymentInput = z.infer<typeof kasbonPaymentInput>;

/**
 * Snapshot stored on a `KASBON_PAYMENT` approval, shown in the inbox.
 * Requests made before split payments carry `method` instead of the parts.
 */
export const kasbonPaymentPayload = z.object({
  kasbonId: z.uuid(),
  amount: z.number(),
  cashAmount: z.number().optional(),
  transferAmount: z.number().optional(),
  method: z.enum(kasbonPaymentMethods).optional(),
  customerName: z.string(),
  invoiceNo: z.string(),
  balance: z.number(),
});
export type KasbonPaymentPayload = z.infer<typeof kasbonPaymentPayload>;

export const kasbonFilters = ["open", "overdue", "settled", "all"] as const;
export type KasbonFilter = (typeof kasbonFilters)[number];

/** Query string of the store credit list (FR-KSB-06). */
export const kasbonListQuery = z.object({
  filter: z.enum(kasbonFilters).catch("open"),
  q: z.string().trim().max(60).catch(""),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  /** Include settled credit marked archived by housekeeping (FR-HK-04). */
  archived: z.literal("1").optional().catch(undefined),
});
