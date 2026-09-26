import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed tokens `subject.expiry.signature` (HMAC-SHA256). Nothing is
 * stored: validity comes from the signature and the embedded expiry, and
 * rotating the secret revokes every token (FR-PDF-04, FR-PDF-06).
 */
function signature(secret: string, purpose: string, subject: string, expires: number): string {
  return createHmac("sha256", secret)
    .update(`${purpose}:${subject}:${String(expires)}`)
    .digest("base64url");
}

export function signToken(
  secret: string,
  purpose: string,
  subject: string,
  expiresAt: Date,
): string {
  const expires = Math.floor(expiresAt.getTime() / 1000);
  return `${subject}.${String(expires)}.${signature(secret, purpose, subject, expires)}`;
}

/** Returns the subject when the token is authentic and unexpired, else null. */
export function verifyToken(
  secret: string,
  purpose: string,
  token: string,
  now = new Date(),
): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [subject = "", expiresText = "", provided = ""] = parts;
  if (!/^\d{1,12}$/.test(expiresText)) return null;
  const expires = Number(expiresText);
  const expected = Buffer.from(signature(secret, purpose, subject, expires));
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return expires * 1000 > now.getTime() ? subject : null;
}
