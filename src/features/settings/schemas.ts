import { z } from "zod";

import { plainText } from "@/lib/validation/text";

/** Transfer destination (FR-SET-05). Account numbers are stored as digits only. */
export const bankAccountInput = z
  .object({
    bankName: plainText(60),
    accountNo: z
      .string()
      .transform((value) => value.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^\d{5,20}$/)),
    accountName: plainText(80),
  })
  .strict();

/** Marketplace name (FR-SET-06); unique case-insensitively. */
export const marketplaceInput = z.object({ name: plainText(40) }).strict();

export type BankAccountInput = z.infer<typeof bankAccountInput>;
export type MarketplaceInput = z.infer<typeof marketplaceInput>;
