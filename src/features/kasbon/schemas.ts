import { z } from "zod";

import { indonesianPhone } from "@/lib/validation/phone";
import { MAX_RUPIAH } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

const isoDate = z.iso.date();

/** Customer on a store credit; the phone is the re-selection key (FR-KSB-01, BR-11). */
export const customerInput = z
  .object({
    name: plainText(80),
    phone: indonesianPhone,
    note: plainText(200, 0),
  })
  .strict();
export type CustomerInput = z.infer<typeof customerInput>;

/** Puts the unpaid remainder of a sale on store credit (FR-PAY-05, BR-11). */
export const kasbonCheckoutInput = z
  .object({
    customer: customerInput,
    dueDate: isoDate.nullable(),
  })
  .strict();
export type KasbonCheckoutInput = z.infer<typeof kasbonCheckoutInput>;

export const kasbonPaymentMethods = ["CASH", "TRANSFER"] as const;

/** An installment or payoff waiting for approval (FR-KSB-03). */
export const kasbonPaymentInput = z.discriminatedUnion("method", [
  z.object({ method: z.literal("CASH"), amount: z.int().min(1).max(MAX_RUPIAH) }).strict(),
  z
    .object({
      method: z.literal("TRANSFER"),
      amount: z.int().min(1).max(MAX_RUPIAH),
      bankAccountId: z.uuid(),
      reference: plainText(60, 0),
    })
    .strict(),
]);
export type KasbonPaymentInput = z.infer<typeof kasbonPaymentInput>;

/** Snapshot stored on a `KASBON_PAYMENT` approval, shown in the inbox. */
export const kasbonPaymentPayload = z.object({
  kasbonId: z.uuid(),
  amount: z.number(),
  method: z.enum(kasbonPaymentMethods),
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
});
