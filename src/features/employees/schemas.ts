import { z } from "zod";

import { usernameSchema } from "@/features/auth/schemas";
import { plainText } from "@/lib/validation/text";

const pin = z.string().regex(/^\d{6}$/);

/** New employee (FR-EMP-01). The initial PIN must be changed at first login (FR-AUTH-06). */
export const createEmployeeInput = z
  .object({
    name: plainText(80),
    username: usernameSchema,
    roleId: z.uuid(),
    pin,
  })
  .strict();

/** Editable profile; the username is immutable (FR-EMP-01). */
export const updateEmployeeInput = z
  .object({
    name: plainText(80),
    roleId: z.uuid(),
  })
  .strict();

/** Temporary PIN set by the owner (FR-AUTH-06). */
export const resetPinInput = z.object({ pin }).strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeInput>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInput>;
export type ResetPinInput = z.infer<typeof resetPinInput>;
