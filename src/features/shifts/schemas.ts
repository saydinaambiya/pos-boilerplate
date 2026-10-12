import { z } from "zod";

import { rupiah } from "@/lib/validation/money";
import { plainText } from "@/lib/validation/text";

/**
 * Opening cash float and an optional note on it (FR-SHF-02); a
 * salesperson's shift ignores both (ADR-0044).
 */
export const openShiftInput = z
  .object({ openingCash: rupiah, note: plainText(200, 0).optional() })
  .strict();

/** Physically counted cash at close; the note explains a variance (FR-SHF-03). */
export const closeShiftInput = z.object({ countedCash: rupiah, note: plainText(200, 0) }).strict();

export type OpenShiftInput = z.infer<typeof openShiftInput>;
export type CloseShiftInput = z.infer<typeof closeShiftInput>;
