import { z } from "zod";

import { normalizeIndonesianPhone } from "@/lib/format/phone";

export { formatIndonesianPhone, normalizeIndonesianPhone } from "@/lib/format/phone";

/** Zod field for an Indonesian mobile number, output normalised. */
export const indonesianPhone = z.string().transform((value, context) => {
  const trimmed = value.trim();
  if (trimmed === "") {
    context.addIssue({ code: "custom", message: "required" });
    return z.NEVER;
  }
  const normalized = normalizeIndonesianPhone(trimmed);
  if (!normalized) {
    context.addIssue({ code: "custom", message: "phone" });
    return z.NEVER;
  }
  return normalized;
});

/** Like {@link indonesianPhone}, but an empty value is allowed and becomes null. */
export const optionalIndonesianPhone = z.string().transform((value, context) => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const normalized = normalizeIndonesianPhone(trimmed);
  if (!normalized) {
    context.addIssue({ code: "custom", message: "phone" });
    return z.NEVER;
  }
  return normalized;
});
