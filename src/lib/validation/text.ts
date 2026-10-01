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

/**
 * A short name typed in place of a listed choice, such as a colour or motif:
 * plain text that starts with a letter or digit and holds only letters,
 * digits, spaces and `.,'&()/-`, so it cannot carry markup or a spreadsheet
 * formula into exports (NFR-SEC-04, ADR-0034).
 */
export function nameText(max: number) {
  return plainText(max).pipe(z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N} .,'&()/-]*$/u));
}
