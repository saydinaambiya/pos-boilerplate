import { z } from "zod";

import { rupiah } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

/**
 * Drawer cash paid into a bank account at an ATM (FR-RPT-07): the store
 * day, the account and the amount the machine accepted.
 */
export const depositInput = z
  .object({
    day: z.iso.date(),
    bankAccountId: z.uuid(),
    amount: rupiah.min(1),
    note: plainText(200, 0),
  })
  .strict();
export type DepositInput = z.infer<typeof depositInput>;

/** Why a deposit is corrected or cancelled; kept in its history (FR-RPT-07). */
export const depositReason = plainText(200);

/** A corrected deposit with the reason for the change (FR-RPT-07, ADR-0032). */
export const depositEditInput = depositInput.extend({ reason: depositReason }).strict();
export type DepositEditInput = z.infer<typeof depositEditInput>;
