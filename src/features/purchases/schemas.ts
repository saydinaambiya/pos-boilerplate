import { z } from "zod";

import { MAX_RUPIAH } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

const isoDate = z.iso.date();

/** How a supplier installment was paid (FR-PRB-03); informational, off the drawer. */
export const purchasePaymentMethods = ["CASH", "TRANSFER"] as const;
export type PurchasePaymentMethod = (typeof purchasePaymentMethods)[number];

/** Whether a bill is paid in full now (lunas) or leaves a remainder (cicil). */
export const purchaseTerms = ["CASH", "CREDIT"] as const;
export type PurchaseTerm = (typeof purchaseTerms)[number];

const purchaseFields = {
  companyName: plainText(80),
  invoiceNo: plainText(40),
  total: z.int().min(1).max(MAX_RUPIAH),
  orderDate: isoDate,
  dueDate: isoDate.nullable(),
  note: plainText(200, 0),
};

const dueAfterOrder = <T extends z.ZodType<{ orderDate: string; dueDate: string | null }>>(
  schema: T,
) =>
  schema.refine((value) => value.dueDate === null || value.dueDate >= value.orderDate, {
    path: ["dueDate"],
    error: "invalid",
  });

/**
 * A new supplier bill (FR-PRB-01/02/05). `paidNow` is what is already paid
 * when it is recorded and only matters when `term` is `CREDIT`; a cash bill
 * is settled for its full `total`. A credit bill with a remainder needs a
 * due date. Nothing restricts the dates, so an older bill can be backdated.
 */
export const purchaseCreateInput = dueAfterOrder(
  z
    .object({
      ...purchaseFields,
      term: z.enum(purchaseTerms),
      paidNow: z.int().min(0).max(MAX_RUPIAH),
      method: z.enum(purchasePaymentMethods),
    })
    .strict()
    .refine((value) => value.paidNow <= value.total, { path: ["paidNow"], error: "tooBig" })
    .refine(
      (value) => value.term !== "CREDIT" || value.paidNow >= value.total || value.dueDate !== null,
      {
        path: ["dueDate"],
        error: "required",
      },
    ),
);
export type PurchaseCreateInput = z.infer<typeof purchaseCreateInput>;

/** Editing a bill's header; installments are kept, only the total is bounded (FR-PRB-01). */
export const purchaseUpdateInput = dueAfterOrder(z.object(purchaseFields).strict());
export type PurchaseUpdateInput = z.infer<typeof purchaseUpdateInput>;

/** An installment or payoff of a supplier bill (FR-PRB-03). */
export const purchasePaymentInput = z
  .object({
    amount: z.int().min(1).max(MAX_RUPIAH),
    paidOn: isoDate,
    method: z.enum(purchasePaymentMethods),
    note: plainText(200, 0),
  })
  .strict();
export type PurchasePaymentInput = z.infer<typeof purchasePaymentInput>;

export const purchaseFilters = ["all", "credit", "settled", "overdue"] as const;
export type PurchaseFilter = (typeof purchaseFilters)[number];

/** Query string of the supplier bill list (FR-PRB-04). */
export const purchaseListQuery = z.object({
  filter: z.enum(purchaseFilters).catch("all"),
  q: z.string().trim().max(60).catch(""),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  /** Include settled bills marked archived by housekeeping (FR-HK-04). */
  archived: z.literal("1").optional().catch(undefined),
});
