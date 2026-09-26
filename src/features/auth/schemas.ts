import { z } from "zod";

/** Usernames are case-insensitive and stored lowercase (FR-EMP-01). */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/);

/** Login form (FR-AUTH-01/02). The secret is a password or a PIN depending on the account. */
export const loginInput = z
  .object({
    username: usernameSchema,
    secret: z.string().min(1).max(128),
  })
  .strict();

export type LoginInput = z.infer<typeof loginInput>;

/** Mandatory PIN change after first login or reset (FR-AUTH-06). */
export const changePinInput = z
  .object({
    pin: z.string().regex(/^\d{6}$/, { error: "format" }),
    confirmPin: z.string(),
  })
  .strict()
  .refine((value) => value.pin === value.confirmPin, {
    path: ["confirmPin"],
    error: "mismatch",
  });

export type ChangePinInput = z.infer<typeof changePinInput>;
