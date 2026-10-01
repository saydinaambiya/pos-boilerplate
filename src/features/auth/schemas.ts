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

/** Owner password with its confirmation (FR-AUTH-01). */
const newPassword = {
  password: z.string().min(12).max(128),
  confirmPassword: z.string(),
};

const passwordsMatch = (value: { password: string; confirmPassword: string }) =>
  value.password === value.confirmPassword;

/** Password change while signed in; the current password proves it is the owner (FR-AUTH-11). */
export const changePasswordInput = z
  .object({ currentPassword: z.string().min(1).max(128), ...newPassword })
  .strict()
  .refine(passwordsMatch, { path: ["confirmPassword"], error: "mismatch" });

export type ChangePasswordInput = z.infer<typeof changePasswordInput>;

/** A forgotten password replaced with a recovery code (FR-AUTH-12, ADR-0037). */
export const recoverPasswordInput = z
  .object({ username: usernameSchema, code: z.string().min(1).max(40), ...newPassword })
  .strict()
  .refine(passwordsMatch, { path: ["confirmPassword"], error: "mismatch" });

export type RecoverPasswordInput = z.infer<typeof recoverPasswordInput>;
