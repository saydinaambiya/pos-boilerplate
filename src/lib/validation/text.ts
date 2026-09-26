import { z } from "zod";

/**
 * Free text from users: NFC-normalised, control characters removed,
 * whitespace collapsed, then length-checked (PRD NFR-SEC-04).
 */
export function plainText(max: number, min = 1) {
  return z
    .string()
    .transform((value) =>
      value
        .normalize("NFC")
        .replace(/\p{Cc}/gu, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .pipe(z.string().min(min).max(max));
}
