import { z } from "zod";

import { expenseCategories } from "@/db/schema/expenses";
import { rupiah } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

/** Kinds that need no recipient: a donation or another expense (FR-EXP-01). */
export const RECIPIENTLESS: readonly (typeof expenseCategories)[number][] = ["DONATION", "OTHER"];

/**
 * A daily staff expense paid from the cash drawer (FR-EXP-01): who got it
 * (required except for donations and other expenses), how much and why;
 * "other" needs a note.
 */
export const expenseInput = z
  .object({
    category: z.enum(expenseCategories),
    recipientId: z.uuid().nullable(),
    amount: rupiah.min(1),
    note: plainText(200, 0),
  })
  .strict()
  .refine((value) => value.recipientId !== null || RECIPIENTLESS.includes(value.category), {
    path: ["recipientId"],
    error: "required",
  })
  .refine((value) => value.category !== "OTHER" || value.note !== "", {
    path: ["note"],
    error: "required",
  });
export type ExpenseInput = z.infer<typeof expenseInput>;

/** The day shown on the expenses page; defaults to today. */
export const expenseDayQuery = z.object({ day: z.iso.date().optional().catch(undefined) });
